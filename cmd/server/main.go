package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/kontrolplane/feed/internal/configuration"
	"github.com/kontrolplane/feed/internal/database"
	"github.com/kontrolplane/feed/internal/handler"
	"github.com/kontrolplane/feed/internal/store"
	"github.com/kontrolplane/feed/internal/worker"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Set up structured logging
	logLevel := slog.LevelInfo
	logHandler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		AddSource: false,
		Level:     logLevel,
	})
	logger := slog.New(logHandler)

	// Parse environment variables
	var cfg configuration.FeedServiceConfiguration
	if err := env.Parse(&cfg); err != nil {
		logger.Error("unable to parse environment variables", slog.Any("error", err))
		os.Exit(1)
	}

	if cfg.Debug {
		logHandler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			AddSource: true,
			Level:     slog.LevelDebug,
		})
		logger = slog.New(logHandler)
	}

	fmt.Fprintf(os.Stderr, `
  ▐▐▐  kontrolplane/feed

  listening:   http://localhost:%d
  driver:      %s
  refresh:     %s

`, cfg.Port, cfg.DatabaseDriver, cfg.RefreshInterval)

	// Create database pool
	pool, err := database.CreatePool(ctx, cfg, logger)
	if err != nil {
		logger.Error("failed to create database pool", slog.Any("error", err))
		os.Exit(1)
	}
	defer pool.Close()

	// Run migrations
	if err := database.Migrate(ctx, cfg, logger); err != nil {
		logger.Error("failed to run database migration", slog.Any("error", err))
		os.Exit(1)
	}

	// Create store
	s := store.New(pool, cfg.DatabaseDriver)

	// Import feeds from file if configured
	if cfg.FeedsFile != "" {
		n, err := store.ImportOPMLFile(ctx, s, cfg.FeedsFile)
		if err != nil {
			logger.Error("failed to import feeds file", slog.String("path", cfg.FeedsFile), slog.Any("error", err))
			os.Exit(1)
		}
		logger.Info("imported feeds from file", slog.String("path", cfg.FeedsFile), slog.Int("feeds", n))
	}

	// Seed database with default feeds when explicitly enabled
	if cfg.Seed {
		if err := store.Seed(ctx, s); err != nil {
			logger.Error("failed to seed database", slog.Any("error", err))
			os.Exit(1)
		}
	}

	// Create handler
	h := handler.New(s, logger, cfg)

	// Start background feed fetcher
	fetcher := worker.NewFetcher(s, logger, cfg.RefreshInterval, func(t time.Time) {
		h.SetLastSync(t)
	})
	fetcher.Start(ctx)

	// Create router
	mux := http.NewServeMux()
	h.Register(mux)

	// Static files
	staticFS := http.FileServer(http.Dir("static"))
	mux.Handle("GET /static/", http.StripPrefix("/static/", staticFS))

	// Create http server
	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      handler.LogRequests(logger)(mux),
		IdleTimeout:  60 * time.Second,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	// Start server in goroutine
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("failed to start the server", slog.Any("error", err))
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	<-ctx.Done()

	// Graceful shutdown
	logger.Info("shutting down gracefully...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Error("failed to shut down gracefully", slog.Any("error", err))
		os.Exit(1)
	}

	logger.Info("service shut down successfully")
}

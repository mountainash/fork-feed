package configuration

import "time"

type FeedServiceConfiguration struct {
	Port            int           `env:"PORT" envDefault:"8080"`
	RefreshInterval time.Duration `env:"REFRESH_INTERVAL" envDefault:"15m"`

	// Database driver: "sqlite" (default) or "postgres"
	DatabaseDriver   string `env:"DATABASE_DRIVER" envDefault:"sqlite"`

	// SQLite configuration
	DatabasePath string `env:"DATABASE_PATH" envDefault:"feed.db"`

	// PostgreSQL configuration
	DatabaseUser     string `env:"DATABASE_USER" envDefault:"postgres"`
	DatabasePassword string `env:"DATABASE_PASSWORD" envDefault:"password"`
	DatabaseHost     string `env:"DATABASE_HOST" envDefault:"postgres"`
	DatabaseName     string `env:"DATABASE_NAME" envDefault:"kontrolplane"`
	DatabasePort     string `env:"DATABASE_PORT" envDefault:"5432"`
	DatabaseSslMode  string `env:"DATABASE_SSL_MODE" envDefault:"disable"`

	Debug bool `env:"DEBUG" envDefault:"false"`
	Seed  bool `env:"SEED" envDefault:"false"`
}

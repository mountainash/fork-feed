package templates

import (
	"fmt"
	"math"
	"strings"
	"time"
)

func FormatDate(iso string) string {
	d, err := time.Parse("2006-01-02", iso)
	if err != nil {
		return iso
	}
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	diff := int(math.Floor(today.Sub(d).Hours() / 24))
	if diff <= 0 {
		return "today"
	}
	if diff == 1 {
		return "1d"
	}
	if diff < 7 {
		return fmt.Sprintf("%dd", diff)
	}
	return iso[5:10]
}

func Pad2(n int) string {
	return fmt.Sprintf("%02d", n)
}

func Truncate(s string, max int) string {
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}

func TruncateURL(u string) string {
	u = strings.TrimPrefix(u, "https://")
	u = strings.TrimPrefix(u, "http://")
	if len(u) > 40 {
		return u[:40] + "…"
	}
	return u
}

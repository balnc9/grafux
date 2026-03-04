package config

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Config holds all settings, sourced from .grafux.yml and overridden by CLI flags.
type Config struct {
	Depth      int    `yaml:"depth"`
	Port       int    `yaml:"port"`
	NoOpen     bool   `yaml:"no-open"`
	ShowHidden bool   `yaml:"show-hidden"`
	Theme      string `yaml:"theme"`
}

func Defaults() Config {
	return Config{
		Depth: 5,
		Theme: "obsidian",
	}
}

// Load reads .grafux.yml from dir. A missing file is not an error.
func Load(dir string) (Config, error) {
	cfg := Defaults()
	data, err := os.ReadFile(filepath.Join(dir, ".grafux.yml"))
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	return cfg, yaml.Unmarshal(data, &cfg)
}

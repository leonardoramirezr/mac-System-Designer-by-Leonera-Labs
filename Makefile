APP_NAME := System Designer
BUILD_DIR := build

build:
	bash build.sh

universal:
	UNIVERSAL=1 bash build.sh

run: build
	open "$(BUILD_DIR)/$(APP_NAME).app"

install: build
	rm -rf "/Applications/$(APP_NAME).app"
	cp -R "$(BUILD_DIR)/$(APP_NAME).app" /Applications/

test:
	node --test tests/*.test.js

# Opens the web UI in the browser (no native shell; storage falls back to localStorage).
web:
	open web/index.html

.PHONY: build universal run install test web

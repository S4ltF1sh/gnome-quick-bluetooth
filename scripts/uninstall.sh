#!/bin/bash

# Bluetooth Quick Manager - Uninstallation Script

UUID="bluetooth-quick-manager@s4ltf1sh.local"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "=== Bluetooth Quick Manager - Uninstall ==="
echo ""

# Check if extension is installed
if [ ! -d "$INSTALL_DIR" ]; then
    echo "Extension is not installed at: $INSTALL_DIR"
    echo ""
    
    # Check for alternative UUIDs
    ALT_DIR="$HOME/.local/share/gnome-shell/extensions/easy-bluetooth@s4ltf1sh.local"
    if [ -d "$ALT_DIR" ]; then
        echo "Found alternative installation at: $ALT_DIR"
        INSTALL_DIR="$ALT_DIR"
        UUID="easy-bluetooth@s4ltf1sh.local"
    else
        echo "No extension found. Nothing to uninstall."
        exit 0
    fi
fi

echo "Extension found at: $INSTALL_DIR"
echo ""

# Check if extension is enabled
if gnome-extensions list 2>/dev/null | grep -q "$UUID"; then
    ENABLED=$(gnome-extensions info "$UUID" 2>/dev/null | grep "State: ENABLED")
    if [ -n "$ENABLED" ]; then
        echo "Disabling extension..."
        gnome-extensions disable "$UUID"
        echo "✓ Extension disabled"
    else
        echo "Extension is already disabled"
    fi
else
    echo "Extension is not in GNOME Shell extensions list"
fi

echo ""
read -p "Do you want to remove extension files? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing extension files..."
    rm -rf "$INSTALL_DIR"
    echo "✓ Extension files removed"
    echo ""
    echo "Extension uninstalled successfully!"
    echo ""
    echo "Restart GNOME Shell to complete:"
    echo "  - X11: Press Alt+F2, type 'r', press Enter"
    echo "  - Wayland: Log out and log back in"
else
    echo ""
    echo "Uninstall cancelled. Extension is disabled but files remain."
    echo "To re-enable: gnome-extensions enable $UUID"
fi

echo ""
echo "Done!"

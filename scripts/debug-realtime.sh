#!/bin/bash

# Bluetooth Quick Manager - Real-time Debug Tool

echo "=== Bluetooth Quick Manager - Debug Mode ==="
echo ""
echo "This will show real-time logs from the extension."
echo "Look for lines starting with [BT]"
echo ""
echo "Actions to test:"
echo "  1. Click Bluetooth icon to open menu"
echo "  2. Watch for '[BT] Scan started successfully'"
echo "  3. Look for '[BT] InterfacesAdded signal received'"
echo "  4. Check '[BT] Adding device to UI'"
echo ""
echo "Press Ctrl+C to stop"
echo ""
echo "--- Starting log stream ---"
echo ""

# Follow GNOME Shell log and filter for our extension
journalctl -f -o cat /usr/bin/gnome-shell | grep --line-buffered "\[BT\]\|Bluetooth.*Manager\|bluetooth-quick-manager"

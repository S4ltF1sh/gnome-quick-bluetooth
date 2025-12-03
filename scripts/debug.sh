#!/bin/bash

echo "=== Bluetooth Manager Debug Tool ==="
echo ""

# Check BlueZ service
echo "1. Checking BlueZ service..."
systemctl status bluetooth --no-pager | head -5
echo ""

# Check bluetoothctl
echo "2. Testing bluetoothctl..."
timeout 2 bluetoothctl show 2>&1 | head -10
echo ""

# Check D-Bus
echo "3. Testing D-Bus access to BlueZ..."
dbus-send --system --print-reply \
  --dest=org.bluez \
  / \
  org.freedesktop.DBus.ObjectManager.GetManagedObjects \
  2>&1 | head -20
echo ""

# Find adapter path
echo "4. Finding Bluetooth adapter path..."
ADAPTER=$(dbus-send --system --print-reply --dest=org.bluez / org.freedesktop.DBus.ObjectManager.GetManagedObjects 2>/dev/null | grep -o "/org/bluez/hci[0-9]*" | head -1)
if [ -n "$ADAPTER" ]; then
    echo "Found adapter: $ADAPTER"
    
    # Get current power state
    echo ""
    echo "5. Getting current power state..."
    dbus-send --system --print-reply \
      --dest=org.bluez \
      "$ADAPTER" \
      org.freedesktop.DBus.Properties.Get \
      string:org.bluez.Adapter1 \
      string:Powered 2>&1
    
    echo ""
    echo "6. Test toggle power (will turn OFF for 2 seconds then ON)..."
    read -p "Press Enter to continue or Ctrl+C to cancel..."
    
    # Turn off
    dbus-send --system --print-reply \
      --dest=org.bluez \
      "$ADAPTER" \
      org.freedesktop.DBus.Properties.Set \
      string:org.bluez.Adapter1 \
      string:Powered \
      variant:boolean:false
    echo "Turned OFF"
    
    sleep 2
    
    # Turn on
    dbus-send --system --print-reply \
      --dest=org.bluez \
      "$ADAPTER" \
      org.freedesktop.DBus.Properties.Set \
      string:org.bluez.Adapter1 \
      string:Powered \
      variant:boolean:true
    echo "Turned ON"
else
    echo "No Bluetooth adapter found!"
fi

echo ""
echo "7. Testing methods to open Bluetooth settings..."
echo ""

echo "Method 1: gnome-control-center bluetooth"
which gnome-control-center && echo "  ✓ Command exists" || echo "  ✗ Command not found"

echo ""
echo "Method 2: blueman-manager"
which blueman-manager && echo "  ✓ Command exists" || echo "  ✗ Command not found"

echo ""
echo "Method 3: Check desktop files..."
find /usr/share/applications ~/.local/share/applications -name "*bluetooth*" 2>/dev/null

echo ""
echo "=== Debug Complete ==="
echo ""
echo "To open settings manually, try:"
echo "  gnome-control-center bluetooth"
echo "  or"
echo "  blueman-manager"

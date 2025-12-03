#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== Bluetooth Quick Manager - Quick Test ==="
echo ""

# Test 1: BlueZ service
echo -n "Test 1: BlueZ service... "
if systemctl is-active --quiet bluetooth; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
    echo "  Fix: sudo systemctl start bluetooth"
fi

# Test 2: Adapter detection
echo -n "Test 2: Bluetooth adapter... "
ADAPTER=$(dbus-send --system --print-reply --dest=org.bluez / org.freedesktop.DBus.ObjectManager.GetManagedObjects 2>/dev/null | grep -o "/org/bluez/hci[0-9]*" | head -1)
if [ -n "$ADAPTER" ]; then
    echo -e "${GREEN}✓ Found: $ADAPTER${NC}"
else
    echo -e "${RED}✗ Not found${NC}"
    echo "  Check: rfkill list"
fi

# Test 3: D-Bus permissions
echo -n "Test 3: D-Bus access... "
if timeout 2 dbus-send --system --print-reply --dest=org.bluez / org.freedesktop.DBus.ObjectManager.GetManagedObjects &>/dev/null; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
    echo "  Fix: Check user groups (lp, bluetooth)"
fi

# Test 4: Can toggle power
echo -n "Test 4: Toggle power... "
if [ -n "$ADAPTER" ]; then
    CURRENT_POWER=$(dbus-send --system --print-reply --dest=org.bluez "$ADAPTER" org.freedesktop.DBus.Properties.Get string:org.bluez.Adapter1 string:Powered 2>/dev/null | grep boolean | awk '{print $3}')
    if [ -n "$CURRENT_POWER" ]; then
        echo -e "${GREEN}✓ Current: $CURRENT_POWER${NC}"
    else
        echo -e "${YELLOW}⚠ Cannot read power state${NC}"
    fi
else
    echo -e "${RED}✗ No adapter${NC}"
fi

# Test 5: gnome-control-center
echo -n "Test 5: GNOME Settings... "
if command -v gnome-control-center &>/dev/null; then
    echo -e "${GREEN}✓ Installed${NC}"
else
    echo -e "${RED}✗ Not found${NC}"
    echo "  Fix: sudo apt install gnome-control-center"
fi

# Test 6: Alternative Bluetooth managers
echo -n "Test 6: Alternative managers... "
ALTERNATIVES=()
command -v blueman-manager &>/dev/null && ALTERNATIVES+=("blueman")
command -v blueberry &>/dev/null && ALTERNATIVES+=("blueberry")
if [ ${#ALTERNATIVES[@]} -gt 0 ]; then
    echo -e "${GREEN}✓ Found: ${ALTERNATIVES[*]}${NC}"
else
    echo -e "${YELLOW}⚠ None found${NC}"
fi

# Test 7: rfkill
echo -n "Test 7: rfkill (fallback)... "
if command -v rfkill &>/dev/null; then
    BLOCKED=$(rfkill list bluetooth | grep -c "Soft blocked: yes")
    if [ "$BLOCKED" -gt 0 ]; then
        echo -e "${YELLOW}⚠ Bluetooth is blocked${NC}"
        echo "  Fix: rfkill unblock bluetooth"
    else
        echo -e "${GREEN}✓ Available and unblocked${NC}"
    fi
else
    echo -e "${YELLOW}⚠ rfkill not found${NC}"
fi

# Test 8: Extension installed
echo -n "Test 8: Extension... "
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/quick-bluetooth"
if [ -d "$EXT_DIR" ]; then
    if gnome-extensions list 2>/dev/null | grep -q "quick-bluetooth"; then
        if gnome-extensions info quick-bluetooth 2>/dev/null | grep -q "State: ENABLED"; then
            echo -e "${GREEN}✓ Installed and enabled${NC}"
        else
            echo -e "${YELLOW}⚠ Installed but disabled${NC}"
            echo "  Fix: gnome-extensions enable quick-bluetooth"
        fi
    else
        echo -e "${YELLOW}⚠ Installed but not recognized${NC}"
        echo "  Fix: Restart GNOME Shell"
    fi
else
    echo -e "${RED}✗ Not installed${NC}"
    echo "  Fix: ./install.sh"
fi

echo ""
echo "=== Summary ==="

# Count issues
ISSUES=0
! systemctl is-active --quiet bluetooth && ((ISSUES++))
[ -z "$ADAPTER" ] && ((ISSUES++))
! command -v gnome-control-center &>/dev/null && ((ISSUES++))
! [ -d "$EXT_DIR" ] && ((ISSUES++))

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! Extension should work.${NC}"
else
    echo -e "${YELLOW}⚠ Found $ISSUES issue(s). Check fixes above.${NC}"
fi

echo ""
echo "Quick fixes:"
echo "  1. Start Bluetooth: sudo systemctl start bluetooth"
echo "  2. Unblock: sudo rfkill unblock bluetooth"
echo "  3. Enable extension: gnome-extensions enable quick-bluetooth"
echo "  4. Restart GNOME: Alt+F2 -> type 'r' -> Enter (X11 only)"
echo ""
echo "For detailed troubleshooting: cat TROUBLESHOOTING.md"

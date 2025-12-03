// Bluetooth Quick Manager - Full Featured Extension
// Features: Toggle Bluetooth, Connect/Disconnect devices, Scan & Pair new devices
const { St, Clutter, GObject, Gio, GLib } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

// Helper functions:
function isTrashBluetoothDevice(device) {
    const name = device?.name || "";

    // Regex MAC address: AA:BB:CC:DD:EE:FF
    const macRegex = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;

    return macRegex.test(name);
}

// Bluetooth Manager Button
const BluetoothManagerButton = GObject.registerClass(
class BluetoothManagerButton extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Bluetooth Manager');
        
        // Icon on topbar
        this._icon = new St.Icon({
            icon_name: 'bluetooth-active-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);
        
        // Adapter path cache
        this._adapterPath = null;
        this._isScanning = false;
        this._spinnerTimeout = null;
        this._discoveredDevices = new Map(); // Track discovered devices to prevent duplicates
        
        // D-Bus proxy for Bluetooth
        this._initDBus();
        
        // Get adapter path immediately on startup
        this._initAdapterPath();
        
        // Build menu
        this._buildMenu();
        
        // Refresh menu when opened and auto-start scan
        // Stop scan when menu closes
        this.menu.connect('open-state-changed', (menu, isOpen) => {
            log('[BT] Menu open-state-changed: isOpen=' + isOpen);
            
            if (isOpen) {
                log('[BT] Menu opened, refreshing...');
                this._refreshMenu();
                
                // Auto-start scan if not already scanning
                if (!this._isScanning && this._adapterPath) {
                    log('[BT] Auto-starting scan, adapter: ' + this._adapterPath);
                    this._startScan();
                } else {
                    log('[BT] Not starting scan: isScanning=' + this._isScanning + ', adapterPath=' + this._adapterPath);
                }
            } else {
                log('[BT] Menu closed');
                // Stop scan when menu closes
                if (this._isScanning) {
                    log('[BT] Stopping scan...');
                    this._stopScan();
                }
            }
        });
    }
    
    _initDBus() {
        this._bluezProxy = null;
        
        try {
            const BluezInterface = Gio.DBusProxy.makeProxyWrapper(
                '<node>\
                  <interface name="org.freedesktop.DBus.ObjectManager">\
                    <method name="GetManagedObjects">\
                      <arg type="a{oa{sa{sv}}}" direction="out"/>\
                    </method>\
                  </interface>\
                </node>'
            );
            
            this._bluezProxy = new BluezInterface(
                Gio.DBus.system,
                'org.bluez',
                '/',
                (proxy, error) => {
                    if (error) {
                        log('BlueZ proxy error: ' + error.message);
                    }
                }
            );
        } catch (e) {
            log('Error initializing D-Bus: ' + e.message);
        }
    }
    
    _initAdapterPath() {
        // Get adapter path immediately on startup
        if (!this._bluezProxy) {
            log('[BT] BlueZ proxy not ready yet, will retry...');
            // Retry after proxy is ready
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this._initAdapterPath();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        
        log('[BT] Getting adapter path on startup...');
        
        this._bluezProxy.GetManagedObjectsRemote((result, error) => {
            if (error) {
                log('[BT] Error getting adapter path: ' + error.message);
                return;
            }
            
            let [objects] = result;
            
            for (let path in objects) {
                let interfaces = objects[path];
                
                if ('org.bluez.Adapter1' in interfaces) {
                    this._adapterPath = path;
                    log('[BT] Adapter path initialized: ' + this._adapterPath);
                    
                    // Update icon based on adapter state
                    let adapterProps = interfaces['org.bluez.Adapter1'];
                    let powered = adapterProps.Powered?.unpack() || false;
                    this._icon.icon_name = powered ? 
                        'bluetooth-active-symbolic' : 
                        'bluetooth-disabled-symbolic';
                    
                    break;
                }
            }
            
            if (!this._adapterPath) {
                log('[BT] No Bluetooth adapter found');
            }
        });
    }
    
    _buildMenu() {
        // Set fixed width for menu to prevent resize when items added
        this.menu.actor.style = 'min-width: 380px;';
        
        // Toggle Bluetooth
        this._bluetoothToggle = new PopupMenu.PopupSwitchMenuItem(
            'Bluetooth',
            true
        );
        
        // Override activate to prevent menu close
        this._bluetoothToggle.activate = (event) => {
            this._bluetoothToggle.toggle();
            return Clutter.EVENT_STOP;
        };
        
        this._bluetoothToggle.connect('toggled', (item) => {
            this._toggleBluetoothWithFallback(item.state);
        });
        this.menu.addMenuItem(this._bluetoothToggle);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Settings button (moved up, right after Bluetooth toggle)
        let settingsItem = new PopupMenu.PopupMenuItem('Bluetooth Settings');
        settingsItem.connect('activate', () => {
            this._openBluetoothSettings();
            this.menu.close();
        });
        this.menu.addMenuItem(settingsItem);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Paired devices section with label
        this._pairedLabel = new PopupMenu.PopupMenuItem('Paired Devices', {
            reactive: false,
            style_class: 'popup-subtitle-menu-item'
        });
        this.menu.addMenuItem(this._pairedLabel);
        
        this._devicesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._devicesSection);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }
    
    _refreshMenu() {
        this._devicesSection.removeAll();
        
        if (!this._bluezProxy) {
            let item = new PopupMenu.PopupMenuItem('Bluetooth not available');
            item.setSensitive(false);
            this._devicesSection.addMenuItem(item);
            return;
        }
        
        this._bluezProxy.GetManagedObjectsRemote((result, error) => {
            if (error) {
                log('Error getting devices: ' + error.message);
                let item = new PopupMenu.PopupMenuItem('Error loading devices');
                item.setSensitive(false);
                this._devicesSection.addMenuItem(item);
                return;
            }
            
            let [objects] = result;
            let pairedDevices = [];
            
            for (let path in objects) {
                let interfaces = objects[path];
                
                if ('org.bluez.Adapter1' in interfaces) {
                    this._adapterPath = path;
                    let adapterProps = interfaces['org.bluez.Adapter1'];
                    let powered = adapterProps.Powered?.unpack() || false;
                    
                    this._bluetoothToggle.setToggleState(powered);
                    this._icon.icon_name = powered ? 
                        'bluetooth-active-symbolic' : 
                        'bluetooth-disabled-symbolic';
                }
                
                if ('org.bluez.Device1' in interfaces) {
                    let deviceProps = interfaces['org.bluez.Device1'];
                    let device = {
                        path: path,
                        name: deviceProps.Name?.unpack() || deviceProps.Address?.unpack() || 'Unknown Device',
                        connected: deviceProps.Connected?.unpack() || false,
                        paired: deviceProps.Paired?.unpack() || false,
                        trusted: deviceProps.Trusted?.unpack() || false,
                        address: deviceProps.Address?.unpack() || '',
                        rssi: deviceProps.RSSI?.unpack() || null,
                    };
                    
                    if (device.paired) {
                        pairedDevices.push(device);
                    }
                }
            }
            
            // Display paired devices
            if (pairedDevices.length === 0) {
                let item = new PopupMenu.PopupMenuItem('No paired devices');
                item.setSensitive(false);
                this._devicesSection.addMenuItem(item);
            } else {
                pairedDevices.sort((a, b) => {
                    if (a.connected && !b.connected) return -1;
                    if (!a.connected && b.connected) return 1;
                    return a.name.localeCompare(b.name);
                });
                
                pairedDevices.forEach(device => {
                    this._addPairedDeviceItem(device);
                });
            }
        });
    }
    
    _addPairedDeviceItem(device) {
        let item = new PopupMenu.PopupSwitchMenuItem(
            device.name,
            device.connected
        );
        
        // Device icon
        let icon = new St.Icon({
            icon_name: this._getDeviceIcon(device),
            style_class: 'popup-menu-icon',
        });
        item.insert_child_at_index(icon, 1);
        
        // Connection status indicator (before device name)
        if (device.connected) {
            let connectedIcon = new St.Icon({
                icon_name: 'emblem-ok-symbolic',
                style_class: 'popup-menu-icon',
                icon_size: 14,
                style: 'color: #4ade80; margin-left: 4px;' // Green color
            });
            item.insert_child_at_index(connectedIcon, 2);
        }
        
        // Create spinner icon (hidden by default)
        let spinner = new St.Icon({
            icon_name: 'process-working-symbolic',
            style_class: 'popup-menu-icon',
            icon_size: 16,
            visible: false
        });

        spinner.set_pivot_point(0.5, 0.5);
        
        // Get the switch widget reference
        let switchWidget = item._switch;
        
        // Add spinner to the end of item
        item.actor.add_child(spinner);
        
        // Override activate to prevent menu close
        item.activate = (event) => {
            item.toggle();
            return Clutter.EVENT_STOP;
        };
        
        // Connect toggle handler with spinner
        let spinnerTimeout = null;
        let isConnecting = false; // Track connection state
        
        item.connect('toggled', (item) => {
            // Block if already connecting
            if (isConnecting) {
                log('[BT] Already connecting, ignoring toggle');
                // Revert the toggle
                item.setToggleState(!item.state);
                return;
            }
            
            let targetState = item.state;
            
            log('[BT] Toggle device: ' + device.name + ' to ' + targetState);
            
            // Set connecting flag
            isConnecting = true;
            
            // Disable the item to prevent clicks
            item.reactive = false;
            item.can_focus = false;
            
            // Hide switch, show spinner
            switchWidget.hide();
            spinner.show();
            
            // Start spinner animation
            let angle = 0;
            spinnerTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                angle = (angle + 30) % 360;
                spinner.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, angle);
                return GLib.SOURCE_CONTINUE;
            });
            
            // Perform connection/disconnection with callback
            this._toggleDeviceWithCallback(device.path, targetState, (success) => {
                log('[BT] Toggle result: ' + success);
                
                // Clear connecting flag
                isConnecting = false;
                
                // Re-enable the item
                item.reactive = true;
                item.can_focus = true;
                
                // Stop spinner
                if (spinnerTimeout) {
                    GLib.source_remove(spinnerTimeout);
                    spinnerTimeout = null;
                }
                spinner.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, 0);
                
                // Show switch, hide spinner
                spinner.hide();
                switchWidget.show();
                
                // Update switch state based on result
                if (!success) {
                    // Revert switch state if failed
                    item.setToggleState(!targetState);
                }
            });
        });
        
        this._devicesSection.addMenuItem(item);
    }

    
    _getDeviceIcon(device) {
        let name = device.name.toLowerCase();
        if (name.includes('headphone') || name.includes('airpods') || 
            name.includes('buds') || name.includes('earphone')) {
            return 'audio-headphones-symbolic';
        } else if (name.includes('keyboard')) {
            return 'input-keyboard-symbolic';
        } else if (name.includes('mouse')) {
            return 'input-mouse-symbolic';
        } else if (name.includes('speaker')) {
            return 'audio-speakers-symbolic';
        } else if (name.includes('phone')) {
            return 'phone-symbolic';
        } else if (name.includes('watch')) {
            return 'watch-symbolic';
        }
        return 'bluetooth-symbolic';
    }

    _toggleBluetoothWithFallback(state) {
        if (this._adapterPath) {
            this._setAdapterPowerDBus(this._adapterPath, state, (success) => {
                if (!success) {
                    log('D-Bus method failed, trying rfkill...');
                    this._setAdapterPowerRfkill(state);
                }
            });
        } else {
            this._setAdapterPowerRfkill(state);
        }
    }
    
    _setAdapterPowerDBus(adapterPath, powered, callback) {
        try {
            Gio.DBus.system.call(
                'org.bluez',
                adapterPath,
                'org.freedesktop.DBus.Properties',
                'Set',
                GLib.Variant.new('(ssv)', [
                    'org.bluez.Adapter1',
                    'Powered',
                    GLib.Variant.new('b', powered)
                ]),
                null,
                Gio.DBusCallFlags.NONE,
                5000,
                null,
                (connection, result) => {
                    try {
                        connection.call_finish(result);
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                            this._refreshMenu();
                            return GLib.SOURCE_REMOVE;
                        });
                        if (callback) callback(true);
                    } catch (e) {
                        log('D-Bus set power error: ' + e.message);
                        this._bluetoothToggle.setToggleState(!powered);
                        if (callback) callback(false);
                    }
                }
            );
        } catch (e) {
            log('D-Bus call error: ' + e.message);
            this._bluetoothToggle.setToggleState(!powered);
            if (callback) callback(false);
        }
    }
    
    _setAdapterPowerRfkill(powered) {
        try {
            let command = powered ? 'rfkill unblock bluetooth' : 'rfkill block bluetooth';
            let [success, pid] = GLib.spawn_async(
                null,
                ['sh', '-c', command],
                null,
                GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                null
            );
            
            if (success) {
                GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
                    GLib.spawn_close_pid(pid);
                    if (status === 0) {
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                            this._refreshMenu();
                            return GLib.SOURCE_REMOVE;
                        });
                    } else {
                        this._bluetoothToggle.setToggleState(!powered);
                    }
                });
            } else {
                this._bluetoothToggle.setToggleState(!powered);
            }
        } catch (e) {
            log('rfkill error: ' + e.message);
            this._bluetoothToggle.setToggleState(!powered);
        }
    }
    
    _toggleDeviceWithCallback(devicePath, connect, callback) {
        try {
            Gio.DBus.system.call(
                'org.bluez',
                devicePath,
                'org.bluez.Device1',
                connect ? 'Connect' : 'Disconnect',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                30000, // 30 second timeout
                null,
                (connection, result) => {
                    try {
                        connection.call_finish(result);
                        log('[BT] Device ' + (connect ? 'connected' : 'disconnected') + ' successfully');
                        
                        // Refresh menu after short delay
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                            this._refreshMenu();
                            return GLib.SOURCE_REMOVE;
                        });
                        
                        // Call callback with success
                        if (callback) callback(true);
                        
                    } catch (e) {
                        log('[BT] Device toggle error: ' + e.message);
                        Main.notify('Bluetooth Manager', 'Connection failed: ' + e.message);
                        
                        // Call callback with failure
                        if (callback) callback(false);
                    }
                }
            );
        } catch (e) {
            log('[BT] Device toggle call error: ' + e.message);
            
            // Call callback with failure
            if (callback) callback(false);
        }
    }
    
    _openBluetoothSettings() {
        const methods = [
            ['gnome-control-center', 'bluetooth'],
            ['XDG_CURRENT_DESKTOP=GNOME', 'gnome-control-center', 'bluetooth'],
            ['blueman-manager'],
            ['gnome-control-center'],
        ];
        
        let tried = 0;
        const tryNextMethod = () => {
            if (tried >= methods.length) {
                Main.notify(
                    'Bluetooth Manager',
                    'Cannot open Bluetooth settings.\nPlease open Settings manually.'
                );
                return;
            }
            
            let method = methods[tried];
            tried++;
            
            try {
                let [success, pid] = GLib.spawn_async(
                    null,
                    method,
                    null,
                    GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                    null
                );
                
                if (success) {
                    GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
                        GLib.spawn_close_pid(pid);
                        if (status !== 0) {
                            tryNextMethod();
                        }
                    });
                } else {
                    tryNextMethod();
                }
            } catch (e) {
                tryNextMethod();
            }
        };
        
        tryNextMethod();
    }
    
    destroy() {
        // Stop spinner animation
        this._stopSpinnerAnimation();
        
        if (this._isScanning && this._adapterPath) {
            this._stopScan();
        }
        
        super.destroy();
    }
});

class Extension {
    constructor() {
        this._indicator = null;
    }
    
    enable() {
        log('Enabling Bluetooth Quick Manager');
        this._indicator = new BluetoothManagerButton();
        Main.panel.addToStatusArea('bluetooth-manager', this._indicator);
    }
    
    disable() {
        log('Disabling Bluetooth Quick Manager');
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}

function init() {
    return new Extension();
}
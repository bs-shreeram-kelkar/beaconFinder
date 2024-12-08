// BLEManager.js
import { BleManager } from 'react-native-ble-plx';
import { useEffect, useState } from 'react';

const BLEManager = () => {
    const [manager] = useState(new BleManager());
    const [devices, setDevices] = useState([]);

    useEffect(() => {
        const subscription = manager.onStateChange((state) => {
            if (state === 'PoweredOn') {
                manager.startDeviceScan(null, null, (error, device) => {
                    if (error) {
                        console.error(error);
                        return;
                    }
                    if (device) {
                        setDevices((prevDevices) => [...prevDevices, device]);
                    }
                });
                subscription.remove();
            }
        }, true);

        return () => {
            manager.stopDeviceScan();
        };
    }, [manager]);

    return { devices };
};

export default BLEManager;

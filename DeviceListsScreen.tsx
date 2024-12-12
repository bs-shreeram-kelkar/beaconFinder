import { useEffect, useState } from "react";
import { Button, SafeAreaView, ScrollView, StyleSheet, Text, View, processColor } from "react-native";
import { BleManager } from "react-native-ble-plx";
import { ScatterChart } from 'react-native-charts-wrapper';

interface Device {
    id: string;
    name: string;
    rssi: number;
    txPower: number;
    distance: number;
    coordinates?: { x: number, y: number };
}

interface KalmanFilter {
    x: number; // estimated value
    p: number; // estimation error covariance
    q: number; // process noise covariance
    r: number; // measurement noise covariance
}

const DeviceListScreen = ({ navigation }: { navigation: any }) => {
    const bleManager = new BleManager();

    // Define beacon coordinates
    const BEACONS = {
        // BS beacon
        'A': {
            uuid: '7C:87:CE:2F:D5:B2',
            // uuid: '6D:0F:A6:61:B0:44',
            txPower: -59,
            coordinates: { x: 0, y: 0 }
        },
        'B': {
            uuid: '4E:E8:76:77:33:45',
            // uuid: 'F0:70:4F:4B:3D:C7', // TV back
            // uuid: 'D0:49:7C:77:52:00', //altBeacon,
            txPower: -59,
            coordinates: { x: 2.5, y: 2.5 }
        },
        'C': {
            uuid: '49:2A:2C:58:B7:29', // iphone beacon
            txPower: -59,
            coordinates: { x: 2.5, y: 0 }
        }
    };

    const [devices, setDevices] = useState<Device[]>([]);
    const [manager] = useState(bleManager);
    const [isScanning, setIsScanning] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
    const [currentPosition, setCurrentPosition] = useState<{ x: number, y: number } | null>(null);
    const [kalmanFilters] = useState<{ [key: string]: KalmanFilter }>({});

    const getBeaconPoints = () => {
        const dataSets = [];

        // Add beacon points
        dataSets.push({
            label: "Beacons",
            values: Object.entries(BEACONS).map(([_, beacon]) => ({
                x: beacon.coordinates.x,
                y: beacon.coordinates.y
            })),
            config: {
                color: processColor('blue'),
                scatterShape: 'CIRCLE',
                scatterShapeSize: 8,
                drawValues: false,
            }
        });

        // Add current position point if it exists
        if (currentPosition) {
            dataSets.push({
                label: "Current Position",
                values: [{
                    x: currentPosition.x,
                    y: currentPosition.y
                }],
                config: {
                    color: processColor('red'),
                    scatterShape: 'SQUARE',
                    scatterShapeSize: 12,
                    drawValues: false,
                }
            });
        }

        return { dataSets };
    };

    const initKalmanFilter = (deviceId: string) => {
        if (!kalmanFilters[deviceId]) {
            kalmanFilters[deviceId] = {
                x: -60, // Initial estimate (typical RSSI value)
                p: 1, // Initial estimate error covariance
                q: 0.1, // Process noise
                r: 1 // Measurement noise
            };
        }
    };

    const updateKalmanFilter = (deviceId: string, measurement: number): number => {
        initKalmanFilter(deviceId);
        const filter = kalmanFilters[deviceId];

        // Prediction
        const p = filter.p + filter.q;

        // Update
        const k = p / (p + filter.r); // Kalman gain
        filter.x = filter.x + k * (measurement - filter.x);
        filter.p = (1 - k) * p;

        return filter.x;
    };

    const calculateDistance = (rssi: number, txPower: number): number => {
        if (rssi === 0 || txPower === 0 || rssi > 0) {
            // Ignore unrealistic values
            return -1.0;
        }

        const ratio = rssi / txPower;
        if (ratio < 1.0) {
            return Math.pow(ratio, 10);
        }
        return 0.89976 * Math.pow(ratio, 7.7095) + 0.111;
    };

    const calculatePosition = (distances: { [key: string]: number }) => {
        // Trilateration calculation
        // Using least squares method to solve the system of equations

        const beaconA = BEACONS.A.coordinates;
        const beaconB = BEACONS.B.coordinates;
        const beaconC = BEACONS.C.coordinates;

        const dA = distances['A'] || 0;
        const dB = distances['B'] || 0;
        const dC = distances['C'] || 0;

        // Form the matrices for least squares solution
        const A = [
            [2 * (beaconB.x - beaconA.x), 2 * (beaconB.y - beaconA.y)],
            [2 * (beaconC.x - beaconA.x), 2 * (beaconC.y - beaconA.y)]
        ];

        const b = [
            [Math.pow(dA, 2) - Math.pow(dB, 2) - Math.pow(beaconA.x, 2) + Math.pow(beaconB.x, 2) - Math.pow(beaconA.y, 2) + Math.pow(beaconB.y, 2)],
            [Math.pow(dA, 2) - Math.pow(dC, 2) - Math.pow(beaconA.x, 2) + Math.pow(beaconC.x, 2) - Math.pow(beaconA.y, 2) + Math.pow(beaconC.y, 2)]
        ];

        // Solve using matrix operations
        const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
        if (Math.abs(det) < 0.0001) return null;

        const x = (A[1][1] * b[0][0] - A[0][1] * b[1][0]) / det;
        const y = (-A[1][0] * b[0][0] + A[0][0] * b[1][0]) / det;

        return { x, y };
    };

    const startScan = () => {
        manager.startDeviceScan(null, null, (error, device) => {
            if (error) {
                console.warn(error);
                return;
            }

            if (device) {
                // Find matching beacon
                const matchingBeacon = Object.entries(BEACONS).find(([_, beacon]) =>
                    beacon.uuid === device.id
                );

                if (matchingBeacon) {
                    const [beaconId, beacon] = matchingBeacon;
                    const filteredRssi = updateKalmanFilter(device.id, device.rssi || 0);
                    const distance = calculateDistance(filteredRssi, beacon.txPower);

                    setDevices(prevDevices => {
                        const existingDeviceIndex = prevDevices.findIndex(d => d.id === device.id);
                        const newDevice = {
                            id: device.id,
                            name: device.name || `Beacon ${beaconId}`,
                            rssi: filteredRssi,
                            txPower: beacon.txPower,
                            distance: distance
                        };

                        if (existingDeviceIndex === -1) {
                            return [...prevDevices, newDevice];
                        } else {
                            const updatedDevices = [...prevDevices];
                            updatedDevices[existingDeviceIndex] = newDevice;
                            return updatedDevices;
                        }
                    });

                    // Calculate position if we have distances to all beacons
                    const distances: { [key: string]: number } = {};
                    devices.forEach(device => {
                        const beaconId = Object.entries(BEACONS).find(([_, b]) => b.uuid === device.id)?.[0];
                        if (beaconId) {
                            distances[beaconId] = device.distance;
                        }
                    });

                    if (Object.keys(distances).length >= 3) {
                        const position = calculatePosition(distances);
                        if (position) {
                            setCurrentPosition(position);
                        }
                    }
                }
            }
        });
    };

    const refreshPosition = () => {
        const distances: { [key: string]: number } = {};
        devices.forEach(device => {
            const beaconId = Object.entries(BEACONS).find(([_, b]) => b.uuid === device.id)?.[0];
            if (beaconId) {
                distances[beaconId] = device.distance;
            }
        });

        const position = calculatePosition(distances);
        if (position) {
            setCurrentPosition(position);
        }
    }

    const startRefresh = () => {
        setIsScanning(true);
        startScan();
        const interval = setInterval(() => {
            manager.stopDeviceScan();
            startScan();
        }, 5000);
        setRefreshInterval(interval);
    };

    const stopRefresh = () => {
        setIsScanning(false);
        if (refreshInterval) {
            clearInterval(refreshInterval);
            setRefreshInterval(null);
        }
        manager.stopDeviceScan();
    };

    useEffect(() => {
        startRefresh();
        return () => {
            stopRefresh();
        };
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.header}>Device Position</Text>
            <View style={styles.chartContainer}>
                <ScatterChart
                    style={styles.chart}
                    data={getBeaconPoints()}
                    xAxis={{
                        axisMinimum: -15,
                        axisMaximum: 15,
                        granularity: 1
                    }}
                    yAxis={{
                        left: {
                            axisMinimum: -15,
                            axisMaximum: 15,
                            granularity: 1
                        },
                        right: {
                            enabled: false
                        }
                    }}
                    legend={{
                        enabled: true,
                        textSize: 14,
                        form: 'CIRCLE',
                        formSize: 14,
                        xEntrySpace: 10,
                        yEntrySpace: 5,
                        formToTextSpace: 5,
                        wordWrapEnabled: true,
                        maxSizePercent: 0.5,
                    }}
                />
            </View>
            <Text>Discovered Beacons:</Text>
            <ScrollView style={styles.deviceList}>
                {devices.map((device) => (
                    <View key={device.id} style={styles.deviceContainer}>
                        <Text style={styles.deviceText}>ID: {device.id}</Text>
                        <Text style={styles.deviceText}>Name: {device.name}</Text>
                        <Text style={styles.deviceText}>RSSI: {device.rssi} dBm</Text>
                        <Text style={styles.deviceText}>Measured Power (Tx): {device.txPower} dBm</Text>
                        <Text style={styles.deviceText}>Distance: {device.distance.toFixed(2)} meters</Text>
                    </View>
                ))}
                {devices.length === 0 && (
                    <Text style={styles.noDevicesText}>Scanning for beacons...</Text>
                )}
            </ScrollView>
            <View style={styles.buttonContainer}>
                {!isScanning ? (
                    <Button title="Refresh Position" onPress={refreshPosition} />
                ) : (
                    <Button title="Refresh Position" onPress={refreshPosition} />
                )}
            </View>
        </SafeAreaView>
    );
};

export default DeviceListScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#f5f5f5',
    },
    deviceList: {
        flex: 1,
    },
    deviceContainer: {
        backgroundColor: '#ffffff',
        padding: 15,
        marginBottom: 10,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    deviceText: {
        fontSize: 16,
        marginBottom: 5,
    },
    noDevicesText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginTop: 20,
    },
    buttonContainer: {
        marginTop: 10,
        marginBottom: 20,
    },
    chartContainer: {
        height: 300,
        marginVertical: 10,
    },
    chart: {
        flex: 1,
    },
    positionContainer: {
        backgroundColor: '#e6f3ff',
        padding: 10,
        borderRadius: 8,
        marginBottom: 10,
    },
    positionText: {
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
    }
});
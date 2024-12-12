import { useEffect, useState } from "react";
import { Button, SafeAreaView, ScrollView, StyleSheet, Text, View, processColor } from "react-native";
import { BleManager } from "react-native-ble-plx";
import { ScatterChart } from 'react-native-charts-wrapper';
import { MMKV } from 'react-native-mmkv';

interface Device {
    id: string;
    name: string;
    rssi: number;
    txPower: number;
    distance: number;
    coordinates?: { x: number, y: number };
    distanceBuffer: number[];
    lastUpdateTime: number;
    // Add raw distance buffer for smoothing
    rawDistanceBuffer: number[];
    // Add stabilized distance
    stabilizedDistance: number;
}

interface KalmanFilter {
    x: number; // estimated value
    p: number; // estimation error covariance
    q: number; // process noise covariance
    r: number; // measurement noise covariance
}

const DeviceListScreen = ({ navigation }: { navigation: any }) => {
    const bleManager = new BleManager();
    const storage = new MMKV();

    // Define beacon coordinates
    const BEACONS = {
        // BS beacon
        'A': {
            uuid: storage.getString('uuid-a') || '7C:87:CE:2F:D5:B2',
            txPower: -59,
            coordinates: { x: 0, y: 0 }
        },
        'B': {
            uuid: storage.getString('uuid-b') || '4E:E8:76:77:33:45',
            txPower: -59,
            coordinates: { x: 2.5, y: 2.5 }
        },
        'C': {
            uuid: storage.getString('uuid-c') || '49:2A:2C:58:B7:29',
            txPower: -59,
            coordinates: { x: 2.5, y: 0 }
        }
    };

    const BUFFER_SIZE = 5; // Number of readings to buffer
    const RAW_BUFFER_SIZE = 10; // Size of raw distance buffer for smoothing
    const UPDATE_INTERVAL = 2000; // Minimum time between updates in ms
    const ALPHA = 0.2; // Low-pass filter coefficient (0-1)

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
        // Ignore invalid RSSI values
        if (rssi === 0 || rssi > 0) {
            return -1.0;
        }

        // Environmental factor (n) varies based on environment
        // 2.0 for free space
        // 2.5-3.0 for indoor office
        // 3.0-3.5 for indoor with obstacles
        const n = 2.5;

        // Calculate distance using Log-distance path loss model
        // d = 10^((|RSSI| - |txPower|)/(10 * n))
        const distance = Math.pow(10, (Math.abs(rssi) - Math.abs(txPower)) / (10 * n));

        // Apply distance correction factors
        let correctedDistance = distance;

        // Signal strength based correction
        if (rssi < -85) {
            // Weak signals are less reliable, increase uncertainty
            correctedDistance *= 1.2;
        }

        // Apply minimum and maximum thresholds
        const MIN_DISTANCE = 0.1;
        const MAX_DISTANCE = 20.0;
        correctedDistance = Math.max(MIN_DISTANCE, Math.min(correctedDistance, MAX_DISTANCE));

        return correctedDistance;
    };

    const applyLowPassFilter = (newValue: number, oldValue: number): number => {
        return ALPHA * newValue + (1 - ALPHA) * oldValue;
    };

    const calculateSmoothedDistance = (rawDistances: number[]): number => {
        if (rawDistances.length === 0) return 0;
        
        // Apply moving average
        const movingAvg = rawDistances.reduce((sum, val) => sum + val, 0) / rawDistances.length;
        
        // Apply low-pass filter using the last smoothed value if available
        const lastSmoothedValue = rawDistances[rawDistances.length - 1];
        const smoothedValue = applyLowPassFilter(movingAvg, lastSmoothedValue);
        
        return smoothedValue;
    };

    const calculateAverageDistance = (distances: number[]): number => {
        // Remove outliers using interquartile range
        const sorted = [...distances].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length / 4)];
        const q3 = sorted[Math.floor(3 * sorted.length / 4)];
        const iqr = q3 - q1;
        const validDistances = distances.filter(d => d >= q1 - 1.5 * iqr && d <= q3 + 1.5 * iqr);
        
        return validDistances.reduce((a, b) => a + b, 0) / validDistances.length;
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
                    const currentDistance = calculateDistance(filteredRssi, beacon.txPower);
                    const now = Date.now();

                    setDevices(prevDevices => {
                        const existingDeviceIndex = prevDevices.findIndex(d => d.id === device.id);
                        let newDevice: Device;

                        if (existingDeviceIndex === -1) {
                            // New device
                            newDevice = {
                                id: device.id,
                                name: device.name || `Beacon ${beaconId}`,
                                rssi: filteredRssi,
                                txPower: beacon.txPower,
                                distance: currentDistance,
                                distanceBuffer: [currentDistance],
                                rawDistanceBuffer: [currentDistance],
                                lastUpdateTime: now,
                                stabilizedDistance: currentDistance
                            };
                            return [...prevDevices, newDevice];
                        } else {
                            // Existing device
                            const existingDevice = prevDevices[existingDeviceIndex];
                            const updatedRawBuffer = [...existingDevice.rawDistanceBuffer, currentDistance]
                                .slice(-RAW_BUFFER_SIZE);
                            const smoothedDistance = calculateSmoothedDistance(updatedRawBuffer);
                            const updatedBuffer = [...existingDevice.distanceBuffer, smoothedDistance]
                                .slice(-BUFFER_SIZE);
                            
                            // Only update distance if enough time has passed and buffer is full
                            const shouldUpdateDistance = 
                                now - existingDevice.lastUpdateTime >= UPDATE_INTERVAL && 
                                updatedBuffer.length >= BUFFER_SIZE;

                            const averageDistance = shouldUpdateDistance ? 
                                calculateAverageDistance(updatedBuffer) : 
                                existingDevice.distance;

                            newDevice = {
                                ...existingDevice,
                                rssi: filteredRssi,
                                distanceBuffer: updatedBuffer,
                                rawDistanceBuffer: updatedRawBuffer,
                                distance: currentDistance, // Keep current distance for display
                                stabilizedDistance: averageDistance, // Store stabilized distance
                                lastUpdateTime: shouldUpdateDistance ? now : existingDevice.lastUpdateTime
                            };

                            const updatedDevices = [...prevDevices];
                            updatedDevices[existingDeviceIndex] = newDevice;
                            return updatedDevices;
                        }
                    });

                    // Calculate position using stabilized distances
                    const distances: { [key: string]: number } = {};
                    devices.forEach(device => {
                        const beaconId = Object.entries(BEACONS).find(([_, b]) => b.uuid === device.id)?.[0];
                        if (beaconId) {
                            distances[beaconId] = device.stabilizedDistance; // Use stabilized distance instead of current
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
                distances[beaconId] = device.stabilizedDistance; // Use stabilized distance here too
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
                        <Text style={styles.deviceText}>Stabilized Distance: {device.stabilizedDistance.toFixed(2)} meters</Text>
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
import React, { useEffect, useState } from 'react';
import { View, Text, Button, SafeAreaView, ScrollView, StyleSheet, Platform, PermissionsAndroid } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

const Stack = createStackNavigator();
const bleManager = new BleManager();

// Define beacon coordinates
const BEACONS = {
  'A': {
    uuid: '8C:64:A2:30:E6:06', // one plus buds kishan
    // uuid: '08:12:87:21:E3:B3', // one plus buds shreeram
    // uuid: '04:57:91:7B:58:01', // someone mouse
    // uuid: 'ED:6B:FF:EB:BF:3F',
    // uuid: '72:49:48:89:53:F6',
    // uuid: '6D:0F:A6:61:B0:44',
    // uuid: 'A0:D0:5B:3B:5C:77',
    // uuid: 'E4:49:7C:77:52:00', // shreeram beacon
    // uuid: '34:F0:43:CD:B9:B8', // swapnil beacon
    // uuid: 'D0:49:7C:77:52:00', // kavita beacon
    // uuid: '43:30:06:1C:41:F8', // link s kishan beacon
    txPower: -72, 
    coordinates: {x: 0, y: 0}
  },
  'B': {
    uuid: '08:12:87:21:E3:B3',
    // uuid: 'E0:9D:13:86:9C:E9', // beacon B
    txPower: -72,
    coordinates: {x: 5, y: 0}
  },
  'C': {
    // uuid: 'D0:49:7C:77:52:00',
    uuid: '49:85:8A:67:15:D5', // kavita bud
    // uuid: '8C:59:DC:FD:32:57', // lock
    txPower: -72,
    coordinates: {x: 0, y: 5}
  }
};

const WelcomeScreen = ({ navigation }: { navigation: any }) => {
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      const allGranted = Object.values(granted).every((status) => status === PermissionsAndroid.RESULTS.GRANTED);
      if (allGranted) {
        navigation.navigate('DeviceList');
      } else {
        console.warn('Bluetooth permissions not granted');
      }
    } else {
      navigation.navigate('DeviceList');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Welcome to Bluetooth Scanner</Text>
      <Button title="Grant Bluetooth Permissions" onPress={requestPermissions} />
    </SafeAreaView>
  );
};

interface Device {
  id: string;
  name: string;
  rssi: number;
  txPower: number;
  distance: number;
  coordinates?: {x: number, y: number};
}

const DeviceListScreen = ({ navigation }: { navigation: any }) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [manager] = useState(bleManager);
  const [isScanning, setIsScanning] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{x: number, y: number} | null>(null);

  const calculateDistance = (rssi: number, txPower: number): number => {
    if (rssi === 0) {
      return -1.0;
    }
    const ratio = rssi * 1.0 / txPower;
    if (ratio < 1.0) {
      return Math.pow(ratio, 10);
    }
    return 0.89976 * Math.pow(ratio, 7.7095) + 0.111;
  };

  const calculatePosition = (distances: {[key: string]: number}) => {
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
      [2*(beaconB.x - beaconA.x), 2*(beaconB.y - beaconA.y)],
      [2*(beaconC.x - beaconA.x), 2*(beaconC.y - beaconA.y)]
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

    return {x, y};
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
          const distance = calculateDistance(device.rssi || 0, beacon.txPower);
          
          setDevices(prevDevices => {
            const existingDeviceIndex = prevDevices.findIndex(d => d.id === device.id);
            const newDevice = {
              id: device.id,
              name: device.name || `Beacon ${beaconId}`,
              rssi: device.rssi || 0,
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
          const distances: {[key: string]: number} = {};
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
      <View style={styles.mapContainer}>
        <Text style={styles.beaconText}>Beacon A (0,0)</Text>
        <Text style={styles.beaconText}>Beacon B (5,0)</Text>
        <Text style={styles.beaconText}>Beacon C (0,5)</Text>
        {currentPosition && (
          <View style={styles.positionContainer}>
            <Text style={styles.positionText}>
              Current Position: ({currentPosition.x.toFixed(2)}, {currentPosition.y.toFixed(2)}) meters
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.subHeader}>Discovered Beacons:</Text>
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
          <Button title="Start Refresh" onPress={startRefresh} />
        ) : (
          <Button title="Stop Refresh" onPress={stopRefresh} />
        )}
      </View>
    </SafeAreaView>
  );
};

const DeviceDetailsScreen = ({ route }: { route: any }) => {
  const { device } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Device Details</Text>
      <Text>ID: {device.id}</Text>
      <Text>Name: {device.name}</Text>
      <Text>RSSI: {device.rssi} dBm</Text>
      <Text>Measured Power (Tx): {device.txPower} dBm</Text>
      <Text>Distance: {device.distance.toFixed(2)} meters</Text>
    </SafeAreaView>
  );
};

const App = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Welcome">
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="DeviceList" component={DeviceListScreen} />
        <Stack.Screen name="DeviceDetails" component={DeviceDetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
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

export default App;

import React, { useEffect, useState } from 'react';
import { View, Text, Button, SafeAreaView, ScrollView, StyleSheet, Platform, PermissionsAndroid } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';

const Stack = createStackNavigator();
const bleManager = new BleManager();

const WelcomeScreen = ({ navigation }) => {
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
    } else if (Platform.OS === 'ios') {
      navigation.navigate('DeviceList');
      if (bluetoothResult === RESULTS.GRANTED && locationResult === RESULTS.GRANTED) {
        navigation.navigate('DeviceList');
      } else {
        console.warn('Bluetooth or Location permissions not granted');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Welcome to Bluetooth Scanner</Text>
      <Button title="Grant Bluetooth Permissions" onPress={requestPermissions} />
    </SafeAreaView>
  );
};

const DeviceListScreen = ({ navigation }) => {
  const [devices, setDevices] = useState([]);
  const [manager] = useState(bleManager);
  const [isScanning, setIsScanning] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(null);

  const startScan = () => {
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.warn(error);
        return;
      }

      if (device) {
        const major = device.manufacturerData ? parseInt(device.manufacturerData.substr(18, 4), 16) : null;
        const minor = device.manufacturerData ? parseInt(device.manufacturerData.substr(22, 4), 16) : null;

        // Only process device if major is 80 and minor is 120
        // if (major === 120 && minor === 80) {
          const distance = calculateDistance(device.rssi);
          const txPower = device.txPowerLevel || -59;
          
          setDevices(prevDevices => {
            const existingDeviceIndex = prevDevices.findIndex(d => d.id === device.id);
            if (existingDeviceIndex === -1) {
              return [...prevDevices, {
                id: device.id,
                name: device.name || 'Unknown',
                rssi: device.rssi,
                txPower: txPower,
                distance: distance,
                major: major,
                minor: minor
              }];
            } else {
              const updatedDevices = [...prevDevices];
              updatedDevices[existingDeviceIndex] = {
                ...updatedDevices[existingDeviceIndex],
                rssi: device.rssi,
                txPower: txPower,
                distance: distance
              };
              return updatedDevices;
            }
          });
        }
      // }
    });
  };

  const calculateDistance = (rssi) => {
    const txPower = -59; // Calibrated transmission power at 1 meter
    if (rssi === 0) {
      return -1.0;
    }
    const ratio = rssi * 1.0 / txPower;
    if (ratio < 1.0) {
      return Math.pow(ratio, 10);
    }
    return 0.89976 * Math.pow(ratio, 7.7095) + 0.111;
  };

  const startRefresh = () => {
    setIsScanning(true);
    startScan();
    const interval = setInterval(() => {
      // Instead of clearing devices, we'll let them update in place
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
      <Text style={styles.header}>Discovered Bluetooth Devices:</Text>
      <ScrollView style={styles.deviceList}>
        {devices.map((device, index) => (
          <View key={device.id} style={styles.deviceContainer}>
            <Text style={styles.deviceText}>ID: {device.id}</Text>
            <Text style={styles.deviceText}>Name: {device.name}</Text>
            <Text style={styles.deviceText}>RSSI: {device.rssi} dBm</Text>
            <Text style={styles.deviceText}>Measured Power (Tx): {device.txPower} dBm</Text>
            <Text style={styles.deviceText}>Distance: {device.distance.toFixed(2)} meters</Text>
            <Text style={styles.deviceText}>Major: {device.major}</Text>
            <Text style={styles.deviceText}>Minor: {device.minor}</Text>
          </View>
        ))}
        {devices.length === 0 && (
          <Text style={styles.noDevicesText}>Scanning for devices...</Text>
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

const DeviceDetailsScreen = ({ route }) => {
  const { device } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Device Details</Text>
      <Text>ID: {device.id}</Text>
      <Text>Name: {device.name}</Text>
      <Text>RSSI: {device.rssi} dBm</Text>
      <Text>Measured Power (Tx): {device.txPower} dBm</Text>
      <Text>Distance: {device.distance.toFixed(2)} meters</Text>
      <Text>Major: {device.major}</Text>
      <Text>Minor: {device.minor}</Text>
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
  }
});

export default App;

import React from 'react';
import { Text, Button, SafeAreaView, StyleSheet, PermissionsAndroid, Platform } from 'react-native';
import { PERMISSIONS, request, RESULTS } from 'react-native-permissions';

const WelcomeScreen = ({ navigation }: { navigation: any }) => {
    const requestPermissions = async () => {
        if (Platform.OS === 'android') {
          const sdkVersion = Platform.Version; // Get Android version
      
          if (sdkVersion >= 31) {
            // Android 12 and above
            const granted = await PermissionsAndroid.requestMultiple([
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
            ]);
            const allGranted = Object.values(granted).every(
              (status) => status === PermissionsAndroid.RESULTS.GRANTED
            );
            if (allGranted) {
              navigation.navigate('DeviceList');
            } else {
              console.warn('Bluetooth permissions not granted');
            }
          } else {
            // Android versions below 12
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
            );
            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
              navigation.navigate('DeviceList');
            } else {
              console.warn('Location permission not granted');
            }
          }
        } else {
          // For iOS
          request(PERMISSIONS.IOS.BLUETOOTH).then((status) => {
            if(status === RESULTS.GRANTED){
              navigation.navigate('DeviceList');
            }else{
              console.warn('Bluetooth permissions not granted');
            }
          });
        }
      };
      

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Welcome to Bluetooth Scanner</Text>
      <Button title="Grant Bluetooth Permissions" onPress={requestPermissions} />
    </SafeAreaView>
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
});

export default WelcomeScreen;

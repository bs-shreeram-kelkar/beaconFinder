import React from 'react';
import { Text, Button, SafeAreaView, StyleSheet, PermissionsAndroid, Platform, ToastAndroid } from 'react-native';

const WelcomeScreen = ({ navigation }: { navigation: any }) => {
    const showErrorToast = (message: string) => {
        ToastAndroid.show(message, ToastAndroid.SHORT);
    };

    const requestBluetoothPermission = async () => {
        if (Platform.OS === 'ios') {
            return true;
        }
        if (Platform.OS === 'android') {
            const apiLevel = parseInt(Platform.Version.toString(), 10);

            if (apiLevel < 31) {
                const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            }

            // For API Level >= 31
            const locationPermission = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
            );

            const blePermissions = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
            ]);

            return (
                locationPermission === PermissionsAndroid.RESULTS.GRANTED &&
                blePermissions['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
                blePermissions['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED
            );
        }

        showErrorToast('Permission have not been granted');
        return false;
    };

    const handlePermissionRequest = async () => {
        const permissionGranted = await requestBluetoothPermission();
        if (permissionGranted) {
            navigation.navigate('DeviceList');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.header}>Welcome to Bluetooth Scanner</Text>
            <Button title="Grant Bluetooth Permissions" onPress={handlePermissionRequest} />
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

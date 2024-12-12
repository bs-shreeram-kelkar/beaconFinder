import React, { useState } from 'react';
import { Text, Button, SafeAreaView, StyleSheet, PermissionsAndroid, Platform, ToastAndroid, TextInput, View } from 'react-native';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

const WelcomeScreen = ({ navigation }: { navigation: any }) => {
    const [uuidA, setUuidA] = useState(storage.getString('uuid-a') || '');
    const [uuidB, setUuidB] = useState(storage.getString('uuid-b') || '');
    const [uuidC, setUuidC] = useState(storage.getString('uuid-c') || '');

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
        // Save UUIDs to storage
        storage.set('uuid-a', uuidA);
        storage.set('uuid-b', uuidB);
        storage.set('uuid-c', uuidC);

        const permissionGranted = await requestBluetoothPermission();
        if (permissionGranted) {
            navigation.navigate('DeviceList');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.header}>Welcome to Bluetooth Scanner</Text>
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Enter UUID A"
                    value={uuidA}
                    onChangeText={setUuidA}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Enter UUID B"
                    value={uuidB}
                    onChangeText={setUuidB}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Enter UUID C"
                    value={uuidC}
                    onChangeText={setUuidC}
                />
            </View>
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
    inputContainer: {
        marginBottom: 20,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
        padding: 10,
        marginBottom: 10,
    },
});

export default WelcomeScreen;

import { View, Text, StyleSheet } from 'react-native'
import React from 'react'

const DeviceDetailsScreen = ({ route }: { route: any }) => {
    const { device } = route.params;

    return (
        <>
            <Text style={styles.header}>Device Details</Text>
            <Text>ID: {device.id}</Text>
            <Text>Name: {device.name}</Text>
            <Text>RSSI: {device.rssi} dBm</Text>
            <Text>Measured Power (Tx): {device.txPower} dBm</Text>
            <Text>Distance: {device.distance.toFixed(2)} meters</Text>
        </>
    );
};

const styles = StyleSheet.create({
    header: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
    },
});

export default DeviceDetailsScreen


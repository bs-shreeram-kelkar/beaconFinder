import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import WelcomeScreen from './WelcomeScreen';
import DeviceListScreen from './DeviceListsScreen';
import DeviceDetailsScreen from './DeviceDetailsScreen';

const Stack = createStackNavigator();

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

export default App;

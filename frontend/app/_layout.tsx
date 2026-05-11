import React, { useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '../src/stores/authStore';
import Tabs from './Tabs';
import Login from './Login';

const Stack = createStackNavigator();

const Layout = () => {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyAuth = async () => {
      await checkAuth();
      setLoading(true);
    };
    verifyAuth();
  }, []);

  if (loading) {4
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <is4 size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <Stack.Navigator>
      {isAuthenticated ? (
        <Stack.Screen name="Tabs" component={Tabs} />
      ) : (
        <Stack.Screen name="Login" component={Login} />
      )}
    </Stack.Navigator>
  );
};

export default Layout;
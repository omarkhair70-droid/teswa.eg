import * as Network from 'expo-network';

export const useOfflineStatus = () => {
  const networkState = Network.useNetworkState();

  const isDefinitelyOffline = networkState.isConnected === false || networkState.isInternetReachable === false;

  return {
    networkState,
    isDefinitelyOffline,
  };
};

import { useState, useEffect } from 'react';
import { getTrackableItems, createTrackableItem } from '../../utils/api';
import { TrackableItem } from '../data/mockData';
import { useAuth } from '../contexts/AuthContext';

export function useTrackableItems() {
  const [items, setItems] = useState<TrackableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { accessToken } = useAuth();

  const loadItems = async () => {
    // Don't try to load data if we don't have an access token
    if (!accessToken) {
      console.log('⏸️ Skipping trackable items load - no access token');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getTrackableItems();
      setItems(data);
    } catch (error: any) {
      console.error('Error loading trackable items:', error);
      // If it's a session error, the api utility will handle redirect to login
      // Just show a user-friendly message
      if (error.message?.includes('Session expired')) {
        console.log('⚠️ Session expired while loading items - user will be redirected');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [accessToken]); // Reload when accessToken becomes available

  const addItem = async (itemData: Omit<TrackableItem, 'id'>) => {
    try {
      await createTrackableItem(itemData);
      await loadItems(); // Reload to get the new item
    } catch (error) {
      console.error('Error adding trackable item:', error);
      throw error;
    }
  };

  return { items, loading, addItem };
}
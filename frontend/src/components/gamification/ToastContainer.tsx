'use client';

/**
 * Container for toast notifications
 */

import React from 'react';
import { useNotifications } from '../../contexts/NotificationContext';
import { Toast } from './Toast';

export function ToastContainer() {
  const { notifications, removeNotification } = useNotifications();

  // Only show the most recent 5 notifications
  const visibleNotifications = notifications.slice(-5);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
      {visibleNotifications.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}

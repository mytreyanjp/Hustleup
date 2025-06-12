
// public/firebase-messaging-sw.js
// Use more recent (but still compat) versions
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// IMPORTANT: REPLACE THE PLACEHOLDERS BELOW WITH YOUR ACTUAL FIREBASE CONFIG VALUES
// These values should come from your .env.local file (or directly from your Firebase project settings)
// process.env will NOT work here as this is a static file served by the browser.
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY_FROM_ENV_LOCAL",
  authDomain: "YOUR_ACTUAL_AUTH_DOMAIN_FROM_ENV_LOCAL",
  projectId: "YOUR_ACTUAL_PROJECT_ID_FROM_ENV_LOCAL",
  storageBucket: "YOUR_ACTUAL_STORAGE_BUCKET_FROM_ENV_LOCAL",
  messagingSenderId: "YOUR_ACTUAL_MESSAGING_SENDER_ID_FROM_ENV_LOCAL",
  appId: "YOUR_ACTUAL_APP_ID_FROM_ENV_LOCAL",
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new update.',
    icon: payload.notification?.icon || '/icons/icon-192x192.png', // Add a default icon in public/icons
    data: payload.data // This can hold custom data like a URL to open
  };

  if (self.registration && typeof self.registration.showNotification === 'function') {
    return self.registration.showNotification(notificationTitle, notificationOptions);
  } else {
    console.error('ServiceWorkerRegistration.showNotification is not supported or registration is not available.');
    // If showNotification is not available, you might not be able to display the notification directly here.
    // This scenario is uncommon in modern browsers that support Push API.
    return Promise.resolve();
  }
});

// Optional: Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Close the notification

  // Example: Open a specific URL or the app itself
  let clickResponsePromise = Promise.resolve();
  if (event.notification.data && event.notification.data.url) {
    clickResponsePromise = clients.openWindow(event.notification.data.url);
  } else {
    // Fallback: try to focus an existing window or open a new one
    clickResponsePromise = clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(function(windowClients) {
      let matchingClient = null;
      for (let i = 0; i < windowClients.length; i++) {
        const windowClient = windowClients[i];
        // Ensure the URL you're matching is correct for your app structure
        if (new URL(windowClient.url).pathname === '/') { 
          matchingClient = windowClient;
          break;
        }
      }
      if (matchingClient) {
        return matchingClient.focus();
      } else {
        return clients.openWindow('/'); // Adjust to your app's root URL
      }
    });
  }
  event.waitUntil(clickResponsePromise);
});

    
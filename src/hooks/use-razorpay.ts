
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useToast } from './use-toast';

declare global {
  interface Window {
    Razorpay: any; // Define Razorpay type on window
  }
}

interface RazorpayOptions {
  key: string;
  amount: number; // Amount in paise (e.g., 10000 for ₹100.00)
  currency: string; // e.g., "INR"
  name: string; // Your business name
  description: string; // Brief description of the transaction
  // image?: string; // URL to your logo
  order_id?: string; // Optional: If you create orders server-side
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  }) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, any>;
  theme?: {
    color?: string; // Hex color code (e.g., #1A202C)
  };
  modal?: {
    ondismiss?: () => void; // Function called when checkout modal is closed
  };
}

interface UseRazorpayProps {
    keyId: string | undefined; // Razorpay Key ID (from env vars)
    onPaymentSuccess: (paymentDetails: { paymentId: string; orderId?: string; signature?: string }) => void;
    onPaymentError: (error: any) => void; // More specific error type if known
}

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

export const useRazorpay = ({ keyId, onPaymentSuccess, onPaymentError }: UseRazorpayProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (document.getElementById('razorpay-checkout-script')) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-checkout-script';
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => setIsLoaded(true);
    script.onerror = () => {
      console.error('Razorpay script failed to load.');
      toast({
          title: 'Payment Error',
          description: 'Could not load payment gateway. Please refresh the page.',
          variant: 'destructive',
      });
    };

    document.body.appendChild(script);

    return () => {
      const scriptElement = document.getElementById('razorpay-checkout-script');
      if (scriptElement && document.body.contains(scriptElement)) {
          // Optional: Remove script on unmount, though usually not necessary
          // document.body.removeChild(scriptElement);
      }
    };
  }, [toast]);


  const openCheckout = useCallback((options: Omit<RazorpayOptions, 'key' | 'handler'>) => {
    if (!isLoaded) {
      toast({ title: 'Payment Gateway Not Ready', description: 'Please wait a moment and try again.', variant: 'destructive'});
      console.error('Razorpay script not loaded yet.');
      return;
    }
    if (!keyId) {
      toast({ title: 'Configuration Error', description: 'Razorpay Key ID is missing.', variant: 'destructive'});
      console.error('Razorpay Key ID is not configured.');
      return;
    }

    // Razorpay's standard checkout modal supports various payment methods including UPI (GPay, PhonePe, etc.),
    // credit/debit cards, net banking, and wallets, depending on your Razorpay account configuration.
    // End-users (clients paying for gigs) do NOT need their own Razorpay account; they use their existing
    // payment methods (e.g., GPay app, bank card). Razorpay handles the secure routing.

    const razorpayOptions: RazorpayOptions = {
      ...options,
      key: keyId,
      handler: (response) => {
          console.log('Razorpay Success Response:', response);
          onPaymentSuccess({
              paymentId: response.razorpay_payment_id,
              orderId: response.razorpay_order_id,
              signature: response.razorpay_signature,
          });
      },
       modal: {
        ...options.modal, // Preserve existing modal options
        ondismiss: () => {
            console.log('Razorpay checkout modal dismissed.');
            toast({ title: 'Payment Cancelled', description: 'The payment process was cancelled.'});
             // You might want a specific callback for dismissal vs. error
             onPaymentError({ code: 'PAYMENT_CANCELLED', description: 'User closed the payment modal.' });
             if (options.modal?.ondismiss) {
                 options.modal.ondismiss(); // Call original ondismiss if provided
             }
        }
       },
        // Set theme color from primary CSS variable
        // Note: This requires the CSS variable to be accessible globally
        theme: {
           ...options.theme,
           // Using a fixed primary color for consistency with the theme
           // Ensure this color contrasts well with Razorpay's modal elements.
           // The value "hsl(var(--primary))" doesn't work directly here as it's a CSS variable.
           // Use the actual HSL values or a hex code for the primary theme color.
           // For --primary: 225 27% 14%; -> dark blue
           color: '#1A237E' // Example: A dark blue, adjust to your theme's primary
        }
    };

     try {
        const rzp = new window.Razorpay(razorpayOptions);
        rzp.on('payment.failed', (response: any) => {
            console.error('Razorpay Payment Failed:', response);
            onPaymentError({
                 code: response.error?.code,
                 description: response.error?.description,
                 source: response.error?.source,
                 step: response.error?.step,
                 reason: response.error?.reason,
                 metadata: response.error?.metadata // Contains order_id, payment_id if available
            });
        });
        rzp.open();
     } catch (error) {
        console.error("Error initializing Razorpay:", error);
        toast({ title: 'Payment Error', description: 'Could not initialize the payment gateway.', variant: 'destructive'});
        onPaymentError(error);
     }

  }, [isLoaded, keyId, onPaymentSuccess, onPaymentError, toast]);

  return { openCheckout, isLoaded };
};


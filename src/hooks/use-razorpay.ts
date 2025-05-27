
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
      // Optional: Script removal on unmount, generally not strictly needed.
      // const scriptElement = document.getElementById('razorpay-checkout-script');
      // if (scriptElement && document.body.contains(scriptElement)) {
      //     document.body.removeChild(scriptElement);
      // }
    };
  }, [toast]);


  const openCheckout = useCallback((options: Omit<RazorpayOptions, 'key' | 'handler'>) => {
    if (!isLoaded) {
      toast({ title: 'Payment Gateway Not Ready', description: 'Please wait a moment and try again.', variant: 'destructive'});
      console.error('Razorpay script not loaded yet.');
      return;
    }
    if (!keyId) {
      toast({ title: 'Configuration Error', description: 'Razorpay Key ID is missing. Please check NEXT_PUBLIC_RAZORPAY_KEY_ID in .env.local', variant: 'destructive'});
      console.error('Razorpay Key ID is not configured.');
      return;
    }

    // As a developer, you need a Razorpay merchant account (with KYC) to generate API keys and manage payments.
    // Your app's end-users (clients paying for gigs) DO NOT need their own Razorpay account.
    // They use their existing payment methods (UPI apps like GPay, PhonePe; Cards; Netbanking) within the Razorpay modal.
    // The availability of specific payment methods (like UPI, cards, wallets) is configured in YOUR Razorpay Merchant Dashboard.
    // This client-side code initiates Razorpay's standard checkout process.

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
        ...options.modal, 
        ondismiss: () => {
            console.log('Razorpay checkout modal dismissed by user.');
            // toast({ title: 'Payment Cancelled', description: 'The payment process was cancelled.'});
             onPaymentError({ code: 'PAYMENT_CANCELLED', description: 'User closed the payment modal.' });
             if (options.modal?.ondismiss) {
                 options.modal.ondismiss(); 
             }
        }
       },
        theme: {
           ...options.theme,
           // This color is for theming the Razorpay modal.
           // Example: A dark blue, adjust to your theme's primary.
           color: '#1A237E' 
        }
    };

    // Log the options being passed to Razorpay for debugging
    console.log("Attempting to initialize Razorpay with options:", {
        key: keyId, // For debugging, you might see your key here.
        amount: razorpayOptions.amount,
        currency: razorpayOptions.currency,
        name: razorpayOptions.name,
        description: razorpayOptions.description,
        prefill_name: razorpayOptions.prefill?.name,
        prefill_email: razorpayOptions.prefill?.email,
        notes: razorpayOptions.notes,
        theme_color: razorpayOptions.theme?.color,
      });

     try {
        const rzp = new window.Razorpay(razorpayOptions);
        rzp.on('payment.failed', (response: any) => {
            console.error('Razorpay Payment Failed Callback. Response:', response);
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
        console.log("Razorpay rzp.open() called.");
     } catch (error) {
        console.error("Error initializing Razorpay instance:", error);
        toast({ title: 'Payment Error', description: 'Could not initialize the payment gateway. Check console for details.', variant: 'destructive'});
        onPaymentError(error);
     }

  }, [isLoaded, keyId, onPaymentSuccess, onPaymentError, toast]);

  return { openCheckout, isLoaded };
};


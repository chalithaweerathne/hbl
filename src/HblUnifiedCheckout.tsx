import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface SdkMetadata {
    url: string;
    integrity: string;
}

// Extend the Window interface to include the Accept SDK global
declare global {
    interface Window {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Accept: (jwt: string) => Promise<any>;
    }
}

const HblUnifiedCheckout: React.FC = () => {
    const navigate = useNavigate();

    const [jwt, setJwt] = useState<string>('');
    const [status, setStatus] = useState<string>('Waiting for JWT input...');
    const [isLoaded, setIsLoaded] = useState<boolean>(false);
    const [isSuccess, setIsSuccess] = useState<boolean>(false);
    const [isError, setIsError] = useState<boolean>(false);

    const sdkRef = useRef<HTMLScriptElement | null>(null);
    const acceptRef = useRef<any>(null);

    const clearPaymentContainer = () => {
        const container = document.getElementById('payment-screen-container');
        if (container) container.innerHTML = '';
    };

    const disposeAccept = () => {
        try {
            if (acceptRef.current && typeof acceptRef.current.dispose === 'function') {
                acceptRef.current.dispose();
            }
        } catch (e) {
            console.warn('Accept dispose failed:', e);
        } finally {
            acceptRef.current = null;
        }
    };

    // Helper to decode the JWT and extract the SDK URL and Integrity hash
    const getSdkMetadata = (token: string): SdkMetadata | null => {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: any = JSON.parse(window.atob(base64));
            return {
                url: payload.ctx[0].data.clientLibrary,
                integrity: payload.ctx[0].data.clientLibraryIntegrity,
            };
        } catch (e) {
            console.error('JWT Decode Error', e);
            return null;
        }
    };

    const initializeCheckout = async () => {
        if (!jwt.trim()) {
            setIsError(true);
            setIsSuccess(false);
            setStatus('Error: Please paste a JWT first.');
            return;
        }

        const metadata = getSdkMetadata(jwt);
        if (!metadata) {
            setIsError(true);
            setIsSuccess(false);
            setStatus('Error: Invalid JWT structure. Could not extract SDK metadata.');
            return;
        }

        // Ensure clean state if user tries again without pressing Reset
        disposeAccept();
        clearPaymentContainer();

        setIsError(false);
        setIsSuccess(false);
        setStatus('Loading Secure SDK...');

        // Remove any previously injected SDK script to avoid duplicates
        if (sdkRef.current) {
            try {
                document.head.removeChild(sdkRef.current);
            } catch {
                // ignore
            }
            sdkRef.current = null;
        }

        // Dynamically load the Cybersource script
        const script = document.createElement('script');
        script.src = metadata.url;
        script.integrity = metadata.integrity;
        script.crossOrigin = 'anonymous';
        script.async = true;

        script.onload = async () => {
            setStatus('SDK Loaded. Initializing Accept Instance...');
            try {
                // 1. Initialize Accept object
                const acceptInstance = await window.Accept(jwt);
                acceptRef.current = acceptInstance;

                // 2. Initialize Unified Payments (sidebar: false = embedded mode)
                const up = await acceptInstance.unifiedPayments(false);

                setStatus('Ready. Loading Manual Entry Form...');

                // 3. Define the container for the manual entry form
                const containerOptions = {
                    containers: {
                        paymentScreen: '#payment-screen-container',
                    },
                };

                // 4. Use createTrigger to load PANENTRY immediately
                const trigger = up.createTrigger('PANENTRY', containerOptions);

                // 5. Show the UI and await the Transient Token
                setStatus('Waiting for user to complete payment...');
                try {
                    const transientToken = await trigger.show();

                    setIsSuccess(true);
                    setIsError(false);
                    setStatus('✅ Success! Transient Token received. Check browser console for details.');
                    console.log('Transient Token JWT:', transientToken);
                } catch (showErr: unknown) {
                    const msg = showErr instanceof Error ? showErr.message : String(showErr || '');
                    console.warn('trigger.show() rejected:', showErr);

                    // Treat "back" / cancel as a cancellation, then navigate to summary page
                    if (msg.includes('COMPLETE_TRANSACTION_CANCELED') || msg.toLowerCase().includes('cancel')) {
                        setIsError(false);
                        setIsSuccess(false);
                        setStatus('Payment cancelled. Redirecting to summary...');

                        disposeAccept();
                        clearPaymentContainer();

                        navigate('/summary-page');
                        return;
                    }

                    // Other show() errors
                    setIsError(true);
                    setIsSuccess(false);
                    setStatus(`Error: ${msg || 'Payment flow was interrupted.'}`);
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Initialization failed';
                setIsError(true);
                setIsSuccess(false);
                setStatus(`Error: ${message}`);
                console.error('SDK Detail Error:', err);
            }
        };

        script.onerror = () => {
            setIsError(true);
            setIsSuccess(false);
            setStatus('Error: SDK failed to load. Ensure you are on HTTPS and the JWT is valid.');
        };

        document.head.appendChild(script);
        sdkRef.current = script;
        setIsLoaded(true);
    };

    const handleReset = () => {
        // Dispose SDK instances
        disposeAccept();

        // Remove the old script tag if present
        if (sdkRef.current) {
            try {
                document.head.removeChild(sdkRef.current);
            } catch {
                // ignore
            }
            sdkRef.current = null;
        }

        setJwt('');
        setIsLoaded(false);
        setIsSuccess(false);
        setIsError(false);
        setStatus('Waiting for JWT input...');

        // Clear the payment container
        clearPaymentContainer();
    };

    const getStatusClass = () => {
        if (isSuccess) return 'status-box status-success';
        if (isError) return 'status-box status-error';
        return 'status-box status-info';
    };

    return (
        <div className="checkout-wrapper">
            <div className="checkout-header">
                <div className="hbl-badge">HBL</div>
                <div>
                    <h1 className="checkout-title">Unified Checkout</h1>
                    <p className="checkout-subtitle">Powered by CyberSource · Secure Payment Gateway</p>
                </div>
            </div>

            <div className="card">
                <label className="input-label" htmlFor="jwt-input">
                    <span className="label-icon">🔑</span> Capture Context JWT
                </label>
                <textarea
                    id="jwt-input"
                    className="jwt-textarea"
                    placeholder="Paste your Capture Context JWT here (eyJ...)..."
                    value={jwt}
                    onChange={(e) => setJwt(e.target.value)}
                    disabled={isLoaded && !isError}
                    spellCheck={false}
                />
                <p className="input-hint">
                    The JWT is obtained from the CyberSource Capture Context API and contains your session
                    credentials and SDK endpoint.
                </p>
            </div>

            <div className="action-row">
                <button
                    id="initialize-btn"
                    className="btn btn-primary"
                    onClick={initializeCheckout}
                    disabled={isLoaded && !isError}
                >
                    <span className="btn-icon">🚀</span>
                    {isLoaded && !isError ? 'Initialized' : 'Initialize HBL Checkout'}
                </button>

                <button
                    id="reset-btn"
                    className="btn btn-secondary"
                    onClick={handleReset}
                    disabled={!isLoaded && !isError && jwt === ''}
                >
                    <span className="btn-icon">↺</span> Reset
                </button>
            </div>

            <div className={getStatusClass()} id="status-box" aria-live="polite">
                <span className="status-label">Status</span>
                <span className="status-text">{status}</span>
            </div>

            <div className="payment-container-wrapper">
                <div className="payment-container-header">
                    <span className="lock-icon">🔒</span>
                    <span>Secure Payment Form</span>
                </div>
                <div
                    id="payment-screen-container"
                    className="payment-screen-container"
                    aria-label="Payment entry form"
                >
                    {!isLoaded && (
                        <div className="payment-placeholder">
                            <div className="placeholder-icon">💳</div>
                            <p className="placeholder-title">Payment Form Area</p>
                            <p className="placeholder-desc">
                                The secure card entry form will appear here after you initialize checkout.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HblUnifiedCheckout;
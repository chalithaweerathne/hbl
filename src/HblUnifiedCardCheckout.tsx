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

const HblUnifiedCardCheckout: React.FC = () => {
    const navigate = useNavigate();
    const [jwt, setJwt] = useState<string>('');
    const [status, setStatus] = useState<string>('Waiting for JWT input...');
    const [isLoaded, setIsLoaded] = useState<boolean>(false);
    const [isSuccess, setIsSuccess] = useState<boolean>(false);
    const [isError, setIsError] = useState<boolean>(false);
    const sdkRef = useRef<HTMLScriptElement | null>(null);

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

        setIsError(false);
        setIsSuccess(false);
        setStatus('Loading Secure SDK...');

        const script = document.createElement('script');
        script.src = metadata.url;
        script.integrity = metadata.integrity;
        script.crossOrigin = 'anonymous';
        script.async = true;

        script.onload = async () => {
            setStatus('SDK Loaded. Initializing Accept Instance...');

            const messageListener = (event: MessageEvent) => {
                if (typeof event.data === 'string' && event.data.includes('/*cybs-telgram*/')) {
                    try {
                        const rawJson = event.data.replace('/*cybs-telgram*/', '');
                        const parsed = JSON.parse(rawJson);
                        if (parsed.event === 'CLOSE') {
                            cleanup();
                            navigate('/summary-page');
                        }
                    } catch (e) { }
                }
                if (event.data && event.data.source === 'mce:App::closeApp') {
                    cleanup();
                    navigate('/summary-page');
                }
            };

            const cleanup = () => {
                window.removeEventListener('message', messageListener);
            };

            window.addEventListener('message', messageListener);

            try {
                const acceptInstance = await window.Accept(jwt);
                // "up" is the Unified Payments instance needed for orchestration [cite: 261]
                const up = await acceptInstance.unifiedPayments(false);
                setStatus('Ready. Loading Manual Entry Form...');

                const containerOptions = {
                    containers: {
                        paymentScreen: '#payment-screen-container',
                    },
                };

                const trigger = up.createTrigger('PANENTRY', containerOptions);

                // 1. Show the form and wait for the transient token [cite: 262, 263]
                const transientToken = await trigger.show();

                setStatus('Processing Authentication/Payment...');

                // 2. Trigger the OTP Challenge / Complete Mandate [cite: 264, 831, 832]
                // This handles Payer Authentication (3DS) automatically if configured [cite: 852]
                const completeResponse = await up.complete(transientToken);

                cleanup();
                setIsSuccess(true);
                setIsError(false);
                setStatus('✅ Payment/Authentication Processed Successfully');
                console.log('Complete Response:', completeResponse);

            } catch (err: any) {
                cleanup();
                console.error('SDK Detail Error:', err);

                // Handle specific 3DS/OTP errors [cite: 1732, 1737]
                let message = 'Initialization failed';
                if (err.reason === 'COMPLETE_AUTHENTICATION_CANCELED') {
                    message = 'Authentication was canceled by the user.';
                } else if (err.reason === 'COMPLETE_AUTHENTICATION_FAILED') {
                    message = 'Authentication failed. Please try a different card.';
                } else {
                    message = err.message || message;
                }

                setIsError(true);
                setIsSuccess(false);
                setStatus(`Error: ${message}`);
            }
        };

        script.onerror = () => {
            setIsError(true);
            setIsSuccess(false);
            setStatus('Error: SDK failed to load.');
        };

        document.head.appendChild(script);
        sdkRef.current = script;
        setIsLoaded(true);
    };

    const handleReset = () => {
        // Remove the old script tag if present
        if (sdkRef.current) {
            document.head.removeChild(sdkRef.current);
            sdkRef.current = null;
        }
        setJwt('');
        setIsLoaded(false);
        setIsSuccess(false);
        setIsError(false);
        setStatus('Waiting for JWT input...');

        // Clear the payment container
        const container = document.getElementById('payment-screen-container');
        if (container) container.innerHTML = '';
    };

    const getStatusClass = () => {
        if (isSuccess) return 'status-box status-success';
        if (isError) return 'status-box status-error';
        return 'status-box status-info';
    };

    return (
        <div className="checkout-wrapper">
            {/* Header */}
            <div className="checkout-header">
                <div className="hbl-badge">HBL</div>
                <div>
                    <h1 className="checkout-title">Unified Checkout</h1>
                    <p className="checkout-subtitle">Powered by CyberSource · Secure Payment Gateway</p>
                </div>
            </div>

            {/* JWT Input Card */}
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

            {/* Action Buttons */}
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

            {/* Status Box */}
            <div className={getStatusClass()} id="status-box" aria-live="polite">
                <span className="status-label">Status</span>
                <span className="status-text">{status}</span>
            </div>

            {/* Payment Screen Container */}
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

export default HblUnifiedCardCheckout;
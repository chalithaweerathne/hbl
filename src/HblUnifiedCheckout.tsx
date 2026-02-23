import React, { useState, useRef } from 'react';

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

            // --- TRACKING FIX START ---
            const messageListener = (event: MessageEvent) => {
                // 1. Check for the Cybersource 'telegram' JSON message you see in your log
                if (typeof event.data === 'string' && event.data.includes('/*cybs-telgram*/')) {
                    try {
                        const rawJson = event.data.replace('/*cybs-telgram*/', '');
                        const parsed = JSON.parse(rawJson);

                        // Check if the event type is "CLOSE" (triggered by Back button)
                        if (parsed.event === 'CLOSE') {
                            console.log('Back button detected via cybs-telgram CLOSE event');
                            // navigate('/your-page'); // Add your navigation logic here
                            window.removeEventListener('message', messageListener);
                        }
                    } catch (e) {
                        // Not a JSON we care about
                    }
                }

                // 2. Fallback check for the 'mce:App::closeApp' source
                if (event.data && event.data.source === 'mce:App::closeApp') {
                    console.log('Back button detected via closeApp source');
                    // navigate('/your-page'); // Add your navigation logic here
                    window.removeEventListener('message', messageListener);
                }
            };

            window.addEventListener('message', messageListener);
            // --- TRACKING FIX END ---

            try {
                const acceptInstance = await window.Accept(jwt);
                const up = await acceptInstance.unifiedPayments(false);
                setStatus('Ready. Loading Manual Entry Form...');

                const containerOptions = {
                    containers: {
                        paymentScreen: '#payment-screen-container',
                    },
                };

                const trigger = up.createTrigger('PANENTRY', containerOptions);

                // This promise hangs when Back is clicked, but the listener above will fire
                const transientToken = await trigger.show();

                // Success cleanup
                window.removeEventListener('message', messageListener);
                setIsSuccess(true);
                setIsError(false);
                setStatus('✅ Success! Transient Token received.');
                console.log('Transient Token JWT:', transientToken);
            } catch (err: any) {
                // Catch cleanup
                window.removeEventListener('message', messageListener);

                // Final check if SDK actually rejects with documented reason code
                if (err?.reason === 'COMPLETE_TRANSACTION_CANCELLED') {
                    console.log('User cancelled flow via standard SDK reason code');
                    return;
                }

                console.error('SDK Detail Error:', err);
                const message = err instanceof Error ? err.message : 'Initialization failed';
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

            {/* Footer */}
            <div className="checkout-footer">
                <span>🔐 256-bit SSL Encrypted</span>
                <span>·</span>
                <span>PCI DSS Compliant</span>
                <span>·</span>
                <span>Powered by CyberSource</span>
            </div>
        </div>
    );
};

export default HblUnifiedCheckout;
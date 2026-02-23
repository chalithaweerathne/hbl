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

        // Dynamically load the Cybersource script
        const script = document.createElement('script');
        script.src = metadata.url;
        script.integrity = metadata.integrity;
        script.crossOrigin = 'anonymous';
        script.async = true;

        try {
            script.onload = async () => {
                setStatus('SDK Loaded. Initializing Accept Instance...');


                try {
                    // 1. Initialize Accept object
                    const acceptInstance = await window.Accept(jwt);

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
                    const transientToken = await trigger.show();

                    setIsSuccess(true);
                    setIsError(false);
                    setStatus('✅ Success! Transient Token received. Check browser console for details.');
                    console.log('Transient Token JWT:', transientToken);
                } catch (err: unknown) {
                    console.error('SDK Detail Error:', err);
                    const message = err instanceof Error ? err.message : 'Initialization failed';
                    setIsError(true);
                    setIsSuccess(false);
                    setStatus(`Error: ${message}`);
                }
            };
        } catch (error: unknown) {
            console.log("Script Load error", error);
        }


        script.onerror = () => {
            setIsError(true);
            setIsSuccess(false);
            setStatus(
                'Error: SDK failed to load. Ensure you are on a Secure Context (HTTPS) and the JWT is valid.'
            );
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
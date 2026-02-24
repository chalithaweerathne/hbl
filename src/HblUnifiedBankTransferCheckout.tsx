import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface SdkMetadata {
    url: string;
    integrity: string;
}

declare global {
    interface Window {
        Accept: (jwt: string) => Promise<any>;
    }
}

const HblUnifiedBankTransferCheckout: React.FC = () => {
    const navigate = useNavigate();
    const [jwt, setJwt] = useState<string>('');
    const [status, setStatus] = useState<string>('Waiting for JWT input...');
    const [isLoaded, setIsLoaded] = useState<boolean>(false);
    const [isSuccess, setIsSuccess] = useState<boolean>(false);
    const [isError, setIsError] = useState<boolean>(false);
    const sdkRef = useRef<HTMLScriptElement | null>(null);

    const getSdkMetadata = (token: string): SdkMetadata | null => {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const payload: any = JSON.parse(window.atob(base64));
            // Citing backend metadata requirements for Pakistan/Urdu locales
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
            setStatus('Error: Please paste a JWT first.');
            return;
        }

        const metadata = getSdkMetadata(jwt);
        if (!metadata) {
            setIsError(true);
            setStatus('Error: Invalid JWT metadata.');
            return;
        }

        setStatus('Loading Bank Transfer SDK...');

        const script = document.createElement('script');
        script.src = metadata.url;
        script.integrity = metadata.integrity;
        script.crossOrigin = 'anonymous';
        script.async = true;

        script.onload = async () => {
            // Listen for the "CLOSE" telegram message for Back button support
            const messageListener = (event: MessageEvent) => {
                if (typeof event.data === 'string' && event.data.includes('/*cybs-telgram*/')) {
                    try {
                        const parsed = JSON.parse(event.data.replace('/*cybs-telgram*/', ''));
                        if (parsed.event === 'CLOSE') {
                            console.log('Back button detected');
                            window.removeEventListener('message', messageListener);
                            navigate('/summary-page');
                        }
                    } catch (e) { }
                }
            };
            window.addEventListener('message', messageListener);

            try {
                const acceptInstance = await window.Accept(jwt);
                const up = await acceptInstance.unifiedPayments(false);

                const containerOptions = {
                    containers: {
                        paymentScreen: '#bank-transfer-container',
                    },
                };

                // Use 'CHECK' for Bank Transfer/Account Based Payments
                const trigger = up.createTrigger('CHECK', containerOptions);

                setStatus('Ready. Select your bank account...');
                const transientToken = await trigger.show();

                window.removeEventListener('message', messageListener);
                setIsSuccess(true);
                setStatus('✅ Bank verification complete! Processing...');
                console.log('Transient Token:', transientToken);

                // For account payments, navigate to a processing or result page
                // navigate('/processing');

            } catch (err: any) {
                window.removeEventListener('message', messageListener);
                if (err?.reason === 'COMPLETE_TRANSACTION_CANCELLED') return;

                setIsError(true);
                setStatus(`Error: ${err.message || 'Initialization failed'}`);
            }
        };

        document.head.appendChild(script);
        sdkRef.current = script;
        setIsLoaded(true);
    };

    return (
        <div className="checkout-wrapper">
            <div className="checkout-header">
                <div className="hbl-badge">HBL</div>
                <div>
                    <h1 className="checkout-title">Bank Transfer</h1>
                    <p className="checkout-subtitle">Secure Account Based Payment (Pakistan)</p>
                </div>
            </div>

            <div className="card">
                <textarea
                    className="jwt-textarea"
                    placeholder="Paste Bank Transfer JWT here..."
                    value={jwt}
                    onChange={(e) => setJwt(e.target.value)}
                    disabled={isLoaded && !isError}
                />
            </div>

            <div className="action-row">
                <button className="btn btn-primary" onClick={initializeCheckout} disabled={isLoaded && !isError}>
                    Initialize Bank Transfer
                </button>
            </div>

            <div className={isError ? 'status-box status-error' : 'status-box status-info'}>
                <span className="status-text">{status}</span>
            </div>

            <div className="payment-container-wrapper">
                <div id="bank-transfer-container" className="payment-screen-container">
                    {!isLoaded && <p>Bank selection form will appear here.</p>}
                </div>
            </div>
        </div>
    );
};

export default HblUnifiedBankTransferCheckout;
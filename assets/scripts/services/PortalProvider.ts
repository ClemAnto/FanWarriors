import { PortalSdk } from './PortalSdk';
import { NullPortal } from './NullPortal';
import { PokiPortal } from './PokiPortal';
import { PORTAL } from '../config/PortalConfig';

/** Singleton factory — picks the portal implementation from the PORTAL flag. */
export class PortalProvider {
    private static _instance: PortalSdk | null = null;

    static get(): PortalSdk {
        if (!PortalProvider._instance) {
            PortalProvider._instance = PORTAL === 'poki' ? new PokiPortal() : new NullPortal();
        }
        return PortalProvider._instance;
    }
}

import Workspace from '../../frontend/features/legacy/workspace';
import {requireAuthenticatedUser} from '../../backend/auth/session';
export const dynamic='force-dynamic';
export default async function Legacy(){await requireAuthenticatedUser('/legacy');return <Workspace/>;}

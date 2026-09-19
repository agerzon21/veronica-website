import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { googleDirectionsLink } from '../../src/data/travel-fee.js';

/**
 * Builds the one Maps link that needs to know where Veronika starts from.
 *
 * WHY THIS ENDPOINT EXISTS AT ALL
 * Her origin is a HOME address. This site is statically built and the entire
 * client bundle is public, so a constant in src/ would publish her home address
 * to anyone who opens view source on the marketing site. The address therefore
 * lives in SESSION_ORIGIN_ADDRESS, a server side environment variable, and this
 * file is the ONLY place in the repository that reads it. Nothing else needs
 * to: the fee arithmetic in src/data/travel-fee.ts works on miles alone, and
 * the Waze, Apple and Google navigate buttons on the client screen carry a
 * destination only and are built in the browser.
 *
 * WHAT STILL REACHES THE BROWSER, STATED PLAINLY
 * The URL this returns contains the origin, because that is the only way
 * Google's directions URL can be told where to measure from. So an admin who
 * clicks "look it up" WILL see the address in the address bar of the tab that
 * opens, and it is in the JSON of this response. There is no arrangement that
 * both prefills the origin and hides it from the person clicking. What this
 * design buys is that the address is absent from the bundle, absent from git,
 * absent from every unauthenticated surface, absent from every client facing
 * contract, email and portal page, and revocable by editing one environment
 * variable. Reaching it requires an admin credential, and the only two people
 * who hold one are Veronika, whose address it is, and Alex, who already has it.
 *
 * THE ALTERNATIVE, AND WHY IT WAS NOT CHOSEN
 * A link with no origin lets Maps use the viewer's current location. That
 * leaks nothing, and it is exactly what the navigate buttons do. It is wrong
 * HERE because the number she reads off that screen becomes a line item on a
 * signed contract: if she happens to be measuring from a coffee shop two towns
 * over, the contract bills the wrong distance and there is nothing on the
 * screen to tell her so. A fee that goes in front of a client has to be
 * measured from a fixed point.
 *
 * UNSET IS NOT AN ERROR. With no SESSION_ORIGIN_ADDRESS the handler returns
 * the directions link without an origin and says so, and the form warns that
 * Maps is measuring from this device. The feature degrades to the manual path
 * instead of failing, which matters because it means everything else here works
 * before Alex sets the variable.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const destination =
    typeof req.body?.destination === 'string' ? req.body.destination.trim() : '';
  if (!destination) {
    return res.status(400).json({ success: false, error: 'destination required' });
  }

  const origin = (process.env.SESSION_ORIGIN_ADDRESS ?? '').trim();

  return res.status(200).json({
    success: true,
    url: googleDirectionsLink(destination, origin || undefined),
    // A boolean, never the value. The form uses it to decide whether to warn
    // that the measurement is coming from the device rather than from base.
    origin_configured: origin.length > 0,
  });
}

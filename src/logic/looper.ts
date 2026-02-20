import { runVolumeLoop } from '../engine/loop';
import { getTimestamp } from '../utils/utils';

export const activeBots = new Map<string, boolean>();
const abortControllers = new Map<string, AbortController>();

export const startVolumeLoop = async (tokenAddress: string, settings: any) => {
    if (activeBots.get(tokenAddress)) return;

    let makersCreated = 0;

    console.log(`🚀 [${getTimestamp()}] [BATCH] Starting maker campaign for ${tokenAddress} with ${settings.targetMakers} makers.`);
    while (makersCreated < settings.targetMakers) {

        console.log(`[${getTimestamp()}] [MODE] ${settings.dryRun ? "🧪 DRY RUN ENABLED (Simulated)" : "⚠️ LIVE TRADING ENABLED (Real SOL)"}`);

        const controller = new AbortController();
        abortControllers.set(tokenAddress, controller);
        activeBots.set(tokenAddress, true);

        try {
            makersCreated++;
            await runVolumeLoop(tokenAddress, settings, controller.signal);
            console.log(`✅ [${getTimestamp()}] [BATCH] Total Makers hit: ${makersCreated}/${settings.targetMakers}`);
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log(`[${getTimestamp()}] [STOP] ${tokenAddress} loop aborted.`);
                break; // Exit the loop if aborted
            } else {
                console.error(`[${getTimestamp()}] [LOOP ERROR] ${err.message}`);
                break;
            }
        } finally {
            activeBots.delete(tokenAddress);
            abortControllers.delete(tokenAddress);
            console.log(`[${getTimestamp()}] [CLEANUP] Bot state cleared for ${tokenAddress}`);
        }
    }

    console.log(`🎯 [${getTimestamp()}] [BATCH] Maker campaign completed for ${tokenAddress}. Total makers created: ${makersCreated}`);
};

export const stopVolumeLoop = (tokenAddress: string) => {
    const controller = abortControllers.get(tokenAddress);
    if (controller) {
        console.log(`[${getTimestamp()}] [STOP] Requesting abort for ${tokenAddress}...`);
        controller.abort();
    }
    activeBots.set(tokenAddress, false);
};
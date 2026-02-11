import { startVolumeLoop } from "../logic/looper";

export const startMakerCampaign = async (
    tokenAddress: string,
    settings: any
) => {
    let makersCreated = 0;

    console.log(`🚀 [BATCH] Starting maker campaign for ${tokenAddress} aiming for ${settings.targetMakers} makers...`);
    while (makersCreated < settings.targetMakers) {
        try {
            await startVolumeLoop(tokenAddress, settings);
        } catch (err) {
            console.error(`[BATCH ERROR]`, err);
        }

        makersCreated++;
        console.log(`✅ [BATCH] Total Makers hit: ${makersCreated}/${settings.targetMakers}`);
    }

    console.log("🏁 [BATCH] Target makers reached.");
};

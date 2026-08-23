import { clamp, wrapAngle } from '../core/math.js';
import { createSpriteAsset, SPRITE_TRANSPARENT } from '../render/sprite.js';
import { rgba } from '../render/software-surface.js';
export const M4_SPRITE_COLORS = {
    dark: rgba(18, 23, 27),
    tire: rgba(12, 14, 16),
    chrome: rgba(196, 211, 218),
    carBody: rgba(236, 82, 56),
    carHighlight: rgba(255, 159, 92),
    tail: rgba(255, 48, 42),
    head: rgba(255, 239, 164),
    glass: rgba(74, 120, 139),
    rider: rgba(244, 216, 161),
    riderSuit: rgba(50, 83, 149),
    bikeBody: rgba(232, 197, 43),
    trunk: rgba(93, 62, 39),
    leafA: rgba(37, 116, 51),
    leafB: rgba(70, 151, 67),
    signFace: rgba(238, 240, 229),
    signMark: rgba(42, 87, 173),
    concrete: rgba(130, 130, 126),
    building: rgba(188, 157, 106),
};
const YAW_VARIANTS = 24;
const BIKE_BANK_VARIANTS = 5;
export function createM4SpriteAssets() {
    return {
        tree: createTreeAsset(),
        sign: createSignAsset(),
        guardrail: createGuardrailAsset(),
        building: createBuildingAsset(),
        car: createCarSet(),
        bike: createBikeSet(),
    };
}
export function selectYawVariant(relativeYaw, count) {
    if (!Number.isInteger(count) || count < 1)
        throw new RangeError('yaw variant count must be >= 1');
    const angle = wrapAngle(relativeYaw);
    const normalized = angle < 0 ? angle + Math.PI * 2 : angle;
    return Math.round(normalized / (Math.PI * 2) * count) % count;
}
export function yawAngleForVariant(index, count) {
    if (!Number.isInteger(count) || count < 1)
        throw new RangeError('yaw variant count must be >= 1');
    const wrapped = ((index % count) + count) % count;
    return wrapAngle((wrapped / count) * Math.PI * 2);
}
export function selectBankVariant(bank, count) {
    if (!Number.isInteger(count) || count < 1)
        throw new RangeError('bank variant count must be >= 1');
    if (count === 1)
        return 0;
    const t = (clamp(bank, -1, 1) + 1) * 0.5;
    return Math.round(t * (count - 1));
}
export function selectVehicleSprite(set, relativeYaw, normalizedBank = 0) {
    const yawIndex = selectYawVariant(relativeYaw, set.yawVariants);
    const bankIndex = selectBankVariant(normalizedBank, set.bankVariants);
    return {
        asset: set.assets[yawIndex][bankIndex],
        yawIndex,
        bankIndex,
    };
}
function createTreeAsset() {
    const b = bitmap(7, 11);
    for (let y = 1; y <= 7; y += 1) {
        const radius = y <= 3 ? 2 : 3;
        for (let x = 3 - radius; x <= 3 + radius; x += 1) {
            if (x >= 0 && x < 7 && Math.abs(x - 3) + Math.abs(y - 4) < 6) {
                b.set(x, y, (x + y) % 2 ? M4_SPRITE_COLORS.leafA : M4_SPRITE_COLORS.leafB);
            }
        }
    }
    b.fillRect(3, 7, 3, 10, M4_SPRITE_COLORS.trunk);
    return createSpriteAsset('TREE', 7, 11, b.pixels, undefined, undefined, 2.5);
}
function createSignAsset() {
    const b = bitmap(9, 8);
    b.fillRect(1, 0, 7, 4, M4_SPRITE_COLORS.signFace);
    b.fillRect(2, 1, 6, 1, M4_SPRITE_COLORS.signMark);
    b.fillRect(4, 2, 4, 3, M4_SPRITE_COLORS.signMark);
    b.fillRect(4, 5, 4, 7, M4_SPRITE_COLORS.concrete);
    return createSpriteAsset('SIGN', 9, 8, b.pixels, undefined, undefined, 1.8);
}
function createGuardrailAsset() {
    const b = bitmap(9, 4);
    b.fillRect(0, 0, 8, 1, M4_SPRITE_COLORS.chrome);
    b.fillRect(1, 2, 1, 3, M4_SPRITE_COLORS.concrete);
    b.fillRect(7, 2, 7, 3, M4_SPRITE_COLORS.concrete);
    return createSpriteAsset('GUARDRAIL', 9, 4, b.pixels, undefined, undefined, 3.0);
}
function createBuildingAsset() {
    const b = bitmap(11, 10);
    b.fillRect(1, 2, 9, 9, M4_SPRITE_COLORS.building);
    b.fillRect(0, 1, 10, 2, M4_SPRITE_COLORS.dark);
    for (let y = 4; y <= 7; y += 3) {
        for (let x = 2; x <= 8; x += 3)
            b.fillRect(x, y, x + 1, y + 1, M4_SPRITE_COLORS.glass);
    }
    return createSpriteAsset('BUILDING', 11, 10, b.pixels, undefined, undefined, 8.0);
}
function createCarSet() {
    const rows = [];
    for (let yawIndex = 0; yawIndex < YAW_VARIANTS; yawIndex += 1) {
        const angle = yawAngleForVariant(yawIndex, YAW_VARIANTS);
        rows.push([createCarVariant(angle, yawIndex)]);
    }
    return { kind: 'car', yawVariants: YAW_VARIANTS, bankVariants: 1, assets: rows };
}
function createCarVariant(angle, yawIndex) {
    // 80 source pixels across 2.0 m. At player depth this is 1:1 by definition.
    const width = 80;
    const height = 56;
    const b = bitmap(width, height);
    const side = Math.sin(angle);
    const facing = Math.cos(angle);
    const roofShift = Math.round(side * 11);
    // Programmer art only; the important M5.2 property is the 80 px / 2.0 m metric reference.
    for (let y = 20; y <= 50; y += 1) {
        const t = (y - 20) / 30;
        const half = Math.round(23 + t * 16);
        b.fillRect(40 - half, y, 40 + half, y, M4_SPRITE_COLORS.carBody);
    }
    b.fillRect(18 + roofShift, 12, 61 + roofShift, 30, M4_SPRITE_COLORS.carHighlight);
    b.fillRect(24 + roofShift, 15, 55 + roofShift, 25, M4_SPRITE_COLORS.glass);
    b.fillRect(0, 45, 10, 55, M4_SPRITE_COLORS.tire);
    b.fillRect(69, 45, 79, 55, M4_SPRITE_COLORS.tire);
    b.fillRect(14, 36, 65, 40, M4_SPRITE_COLORS.dark);
    if (facing >= 0) {
        b.fillRect(14, 39, 23, 44, M4_SPRITE_COLORS.tail);
        b.fillRect(56, 39, 65, 44, M4_SPRITE_COLORS.tail);
    }
    else {
        b.fillRect(14, 39, 23, 44, M4_SPRITE_COLORS.head);
        b.fillRect(56, 39, 65, 44, M4_SPRITE_COLORS.head);
    }
    return createSpriteAsset(`CAR_YAW_${yawIndex}`, width, height, b.pixels, undefined, undefined, 2.0);
}
function createBikeSet() {
    const rows = [];
    for (let yawIndex = 0; yawIndex < YAW_VARIANTS; yawIndex += 1) {
        const angle = yawAngleForVariant(yawIndex, YAW_VARIANTS);
        const banks = [];
        for (let bankIndex = 0; bankIndex < BIKE_BANK_VARIANTS; bankIndex += 1) {
            const normalizedBank = bankIndex / (BIKE_BANK_VARIANTS - 1) * 2 - 1;
            banks.push(createBikeVariant(angle, normalizedBank, yawIndex, bankIndex));
        }
        rows.push(banks);
    }
    return { kind: 'bike', yawVariants: YAW_VARIANTS, bankVariants: BIKE_BANK_VARIANTS, assets: rows };
}
function createBikeVariant(angle, bank, yawIndex, bankIndex) {
    // DEV physical width 0.80 m, authored at the same 40 source-pixel/m reference density.
    const width = 32;
    const height = 64;
    const b = bitmap(width, height);
    const side = Math.sin(angle);
    const lean = Math.round(bank * 8 + side * 4);
    const cx = 16;
    b.fillRect(cx - 2, 50, cx + 2, 63, M4_SPRITE_COLORS.tire);
    b.fillRect(cx - 4, 43, cx + 4, 55, M4_SPRITE_COLORS.chrome);
    b.fillRect(cx - 8, 36, cx + 8, 50, M4_SPRITE_COLORS.bikeBody);
    const riderX = Math.round(clamp(cx + lean, 7, 25));
    b.fillRect(riderX - 4, 13, riderX + 4, 21, M4_SPRITE_COLORS.rider);
    b.fillRect(riderX - 7, 22, riderX + 7, 38, M4_SPRITE_COLORS.riderSuit);
    b.fillRect(riderX - 10, 31, riderX + 10, 36, M4_SPRITE_COLORS.riderSuit);
    return createSpriteAsset(`BIKE_YAW_${yawIndex}_BANK_${bankIndex}`, width, height, b.pixels, undefined, undefined, 0.80);
}
function bitmap(width, height) {
    const pixels = new Uint32Array(width * height);
    pixels.fill(SPRITE_TRANSPARENT);
    const set = (x, y, color) => {
        if (x < 0 || x >= width || y < 0 || y >= height)
            return;
        pixels[y * width + x] = color >>> 0;
    };
    const fillRect = (x0, y0, x1, y1, color) => {
        const left = Math.max(0, Math.min(x0, x1));
        const right = Math.min(width - 1, Math.max(x0, x1));
        const top = Math.max(0, Math.min(y0, y1));
        const bottom = Math.min(height - 1, Math.max(y0, y1));
        for (let y = top; y <= bottom; y += 1) {
            for (let x = left; x <= right; x += 1)
                set(x, y, color);
        }
    };
    return { pixels, set, fillRect };
}

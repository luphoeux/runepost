export const baseFontSize = { chapter: 14, title: 20, description: 18, footer: 12 };
export const BASE_MIN_WIDTH = 266;
export const BASE_GAP = 4;
export const BASE_PADDING = 12;
export const fontTitle = 'Morpheus';
export const fontBody = 'Baumans';
export const fontObjective = 'Friz Quadrata';
export const colorTextDark = '#1D0000';
export const colorTitle = '#2D1400';
export const colorTitleShadow = '#FFE126';
export const colorTextMeta = '#1D0000';
export const separatorColor = '#DEA286';

let bgImage: HTMLImageElement | null = null;
let esquineroImage: HTMLImageElement | null = null;
let questIconImage: HTMLImageElement | null = null;
let fontsLoaded = false;

// El panel se publica bajo /admin, por lo que los assets deben respetar la base de Vite.
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function initAssets() {
    if (!fontsLoaded) {
        try {
            const f1 = new FontFace('Morpheus', `url(${assetUrl('assets/fonts/MORPHEUS.TTF')})`);
            const f2 = new FontFace('Friz Quadrata', `url("${assetUrl('assets/fonts/Friz Quadrata Regular.ttf')}")`);
            await Promise.all([f1.load(), f2.load()]);
            (document.fonts as any).add(f1);
            (document.fonts as any).add(f2);
            fontsLoaded = true;
        } catch (e) {
            console.error('Fonts error', e);
        }
    }
    
    if (!bgImage) {
        bgImage = await loadImg(assetUrl('assets/images/bg.jpg')).catch(() => null);
    }
    if (!esquineroImage) {
        esquineroImage = await loadImg(assetUrl('assets/images/esquinero.png')).catch(() => null);
    }
    if (!questIconImage) {
        try {
            const response = await fetch(assetUrl('assets/images/quest_icon.svg'));
            let text = await response.text();
            if (text.includes('width=')) {
                text = text.replace(/width="[^"]*"/, 'width="1024"').replace(/height="[^"]*"/, 'height="1024"');
            } else {
                text = text.replace('<svg', '<svg width="1024" height="1024"');
            }
            const blob = new Blob([text], { type: 'image/svg+xml' });
            questIconImage = await loadImg(URL.createObjectURL(blob));
        } catch (e) {
            console.error('Icon error', e);
        }
    }
}

function calculateDimensions(ctx: CanvasRenderingContext2D, quest: any, scale: number) {
    const sFontTitle = baseFontSize.title * scale;
    const sFontDesc = baseFontSize.description * scale;
    const sFontChapter = baseFontSize.chapter * scale;
    const sFontFooter = baseFontSize.footer * scale;
    const sPadding = BASE_PADDING * scale;
    const sGap = BASE_GAP * scale;
    const sMinWidth = BASE_MIN_WIDTH * scale;
    const sIconWidth = 13.75 * scale;

    const titleText = (quest.title || 'Title');
    ctx.font = `${sFontTitle}px "${fontTitle}", sans-serif`;
    const titleMetrics = ctx.measureText(titleText);
    const titleWidth = sPadding + sIconWidth + sGap + titleMetrics.width + sPadding;
    const finalWidth = Math.max(sMinWidth, Math.ceil(titleWidth));

    const objectiveText = Array.isArray(quest.objectives) ? quest.objectives.join('\n') : (quest.objectives || 'Quest Objective');
    ctx.font = `${sFontDesc}px "${fontObjective}", sans-serif`;
    const maxTextWidth = finalWidth - (sPadding * 2);
    const lineHeight = sFontDesc + (4 * scale);

    let line = '', lineCount = 0, words = objectiveText.split(' ');
    for (let n = 0; n < words.length; n++) {
        const test = line + words[n] + ' ';
        if (ctx.measureText(test).width > maxTextWidth && n > 0) {
            lineCount++; line = words[n] + ' ';
        } else {
            line = test;
        }
    }
    lineCount++;

    let h = sPadding;
    h += sFontChapter;
    h += sFontTitle;
    h += (lineCount * lineHeight) + sGap;
    h += sGap + (2 * scale) + sGap;
    h += sFontFooter + sGap;
    h += sFontFooter + sGap;
    h += sPadding;

    return { width: finalWidth, height: h };
}

function drawBackgroundCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
    const r = w / h, ir = img.width / img.height;
    let rw, rh, ox, oy;
    if (r > ir) { rw = w; rh = w / ir; ox = 0; oy = (h - rh) / 2; }
    else { rw = h * ir; rh = h; ox = (w - rw) / 2; oy = 0; }
    ctx.drawImage(img, ox, oy, rw, rh);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
    const words = text.split(' ');
    let line = '', startY = y;
    for (let n = 0; n < words.length; n++) {
        const test = line + words[n] + ' ';
        if (ctx.measureText(test).width > maxW && n > 0) {
            ctx.fillText(line, x, startY + lh);
            line = words[n] + ' ';
            startY += lh;
        } else {
            line = test;
        }
    }
    ctx.fillText(line, x, startY + lh);
    return startY + lh;
}

export async function generateQuestImageBlob(quest: any, scale: number = 2): Promise<Blob | null> {
    await initAssets();
    if (!bgImage) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let typeText = quest.category || 'Story Quest';
    if (typeText.toLowerCase().includes('interact')) typeText = "Interaction Quest";
    if (typeText.toLowerCase().includes('breadcrumb')) typeText = "Story Quest";

    const sFontTitle = baseFontSize.title * scale, sFontDesc = baseFontSize.description * scale;
    const sFontChapter = baseFontSize.chapter * scale, sFontFooter = baseFontSize.footer * scale;
    const sPadding = BASE_PADDING * scale, sGap = BASE_GAP * scale;
    const sIconWidth = 13.75 * scale;
    let sIconHeight = sIconWidth;
    if (questIconImage?.width) sIconHeight = sIconWidth * (questIconImage.height / questIconImage.width);

    const dims = calculateDimensions(ctx, quest, scale);
    canvas.width = dims.width; canvas.height = dims.height;
    const W = dims.width;

    drawBackgroundCover(ctx, bgImage, W, dims.height);
    let y = sPadding;
    ctx.textAlign = 'left';

    // Header
    ctx.font = `${sFontChapter}px "${fontBody}", sans-serif`;
    ctx.fillStyle = colorTextMeta;
    ctx.fillText(quest.chain_name ? `${quest.chain_name}` : `Quest #${quest.id}`, sPadding, y + sFontChapter);
    y += sFontChapter;

    // Title + Icon
    const titleY = y + sFontTitle;
    if (questIconImage) ctx.drawImage(questIconImage, sPadding, titleY - sIconHeight, sIconWidth, sIconHeight);

    ctx.font = `${sFontTitle}px "${fontTitle}", sans-serif`;
    ctx.save();
    ctx.shadowColor = colorTitleShadow;
    ctx.shadowBlur = 2 * scale;
    ctx.shadowOffsetX = 1 * scale;
    ctx.shadowOffsetY = 1 * scale;
    ctx.fillStyle = colorTitle;
    ctx.fillText((quest.title || 'Title'), sPadding + sIconWidth + sGap, titleY);
    ctx.restore();
    y += sFontTitle;

    // Objective
    ctx.font = `${sFontDesc}px "${fontObjective}", sans-serif`;
    ctx.fillStyle = colorTextDark;
    const lh = sFontDesc + (4 * scale);
    y = wrapText(ctx, Array.isArray(quest.objectives) ? quest.objectives.join('\n') : (quest.objectives || 'Quest Objective'), sPadding, y, W - (sPadding * 2), lh);
    y += sGap + sGap;

    // Separator
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = separatorColor;
    ctx.fillRect(sPadding, y, W - (sPadding * 2), 1 * scale);
    ctx.restore();
    y += (2 * scale) + sGap;

    // Footer
    ctx.font = `${sFontFooter}px "${fontObjective}", sans-serif`;
    ctx.fillStyle = colorTextMeta;
    ctx.fillText(typeText, sPadding, y + sFontFooter);
    y += sFontFooter + sGap;
    ctx.fillText(quest.duration || '<= 1 Minute', sPadding, y + sFontFooter);

    // Esquinero
    if (esquineroImage) {
        const d = 33 * scale;
        ctx.drawImage(esquineroImage, W - d, dims.height - d, d, d);
    }

    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/jpeg', 0.95);
    });
}

import { supabase } from './supabaseClient';

export async function uploadQuestImage(quest: any): Promise<string | null> {
    const blob = await generateQuestImageBlob(quest, 2);
    if (!blob) return null;

    const fileName = `quest_${quest.id}_${Date.now()}.jpg`;
    
    // We assume the bucket is named "quests" or "images". Let's use "quests" bucket
    const { error } = await supabase.storage.from('quests').upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true
    });

    if (error) {
        console.error('Error uploading quest image:', error);
        
        // Try fallback to 'images' bucket if 'quests' bucket doesn't exist
        const fallback = await supabase.storage.from('images').upload(fileName, blob, {
            contentType: 'image/jpeg',
            upsert: true
        });
        if (fallback.error) {
            console.error('Fallback error uploading quest image:', fallback.error);
            return null;
        }
        
        const { data: publicData } = supabase.storage.from('images').getPublicUrl(fileName);
        return publicData.publicUrl;
    }

    const { data: publicData } = supabase.storage.from('quests').getPublicUrl(fileName);
    return publicData.publicUrl;
}


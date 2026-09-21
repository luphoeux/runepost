import { useEffect, useRef } from 'react';
import { XClose } from '@untitledui/icons';
import type { Quest } from '../types/quest-types';

interface Props {
    quest: Quest | null;
    onClose: () => void;
}

const QUALITY_COLORS: Record<string, string> = {
    Poor: '#9d9d9d',
    Common: '#ffffff',
    Uncommon: '#1eff00',
    Rare: '#0070dd',
    Epic: '#a335ee',
    Legendary: '#ff8000',
};

function goldToFormatted(copper: number) {
    const gold = Math.floor(copper / 10000);
    const silver = Math.floor((copper % 10000) / 100);
    const cop = copper % 100;
    return { gold, silver, cop };
}

function normalizeRewardItems(raw: any): any[] {
    if (!raw) return [];
    // Ya es un array
    if (Array.isArray(raw)) return raw;
    // Supabase a veces devuelve JSONB como string
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    // Objeto suelto (un solo item sin array)
    if (typeof raw === 'object') return [raw];
    return [];
}

export default function QuestWowModal({ quest, onClose }: Props) {
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    if (!quest) return null;

    const rewardItems: any[] = normalizeRewardItems(quest.reward_items);
    const choiceItems = rewardItems.filter(i => i.choice);
    const fixedItems = rewardItems.filter(i => !i.choice);

    const money = quest.reward_gold ? goldToFormatted(quest.reward_gold) : null;

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-start justify-end"
            onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
        >
            {/* Slide-in panel */}
            <div
                className="relative h-full w-full max-w-lg overflow-y-auto shadow-2xl"
                style={{
                    background: 'linear-gradient(160deg, #2a1e0e 0%, #1c1409 60%, #130e05 100%)',
                    borderLeft: '1px solid #6b4c1e',
                    animation: 'slideInRight 0.28s cubic-bezier(.4,0,.2,1)',
                }}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-1.5 rounded-full transition-colors"
                    style={{ background: 'rgba(107,76,30,0.3)', color: '#c8a45e' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(107,76,30,0.6)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(107,76,30,0.3)')}
                >
                    <XClose className="w-4 h-4" />
                </button>

                {/* Parchment inner container */}
                <div
                    className="min-h-full p-8 pt-10"
                    style={{
                        background: `
                            radial-gradient(ellipse at top, rgba(201,155,77,0.07) 0%, transparent 60%),
                            radial-gradient(ellipse at bottom right, rgba(180,120,40,0.05) 0%, transparent 60%)
                        `,
                    }}
                >
                    {/* Top decorative divider */}
                    <div className="flex items-center gap-3 mb-6">
                        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #6b4c1e, #c8a45e, #6b4c1e, transparent)' }} />
                        <span style={{ color: '#c8a45e', fontSize: '14px' }}>&#10022;</span>
                        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, #6b4c1e, #c8a45e, #6b4c1e, transparent)' }} />
                    </div>

                    {/* Quest Title */}
                    <h1
                        style={{
                            fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
                            fontSize: '22px',
                            fontWeight: 'bold',
                            color: '#f0c060',
                            textShadow: '0 1px 8px rgba(240,192,96,0.4)',
                            lineHeight: 1.3,
                            marginBottom: '6px',
                        }}
                    >
                        {quest.title}
                    </h1>

                    {/* Meta info */}
                    <div className="flex items-center gap-3 mb-6" style={{ color: '#8a7050', fontSize: '12px' }}>
                        <span>ID: {quest.id}</span>
                        {quest.zone && <><span>·</span><span>{quest.zone}</span></>}
                        {quest.giver_npc && <><span>·</span><span>{quest.giver_npc}</span></>}
                    </div>

                    {/* Description */}
                    {quest.description && (
                        <p
                            style={{
                                fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
                                fontSize: '14.5px',
                                lineHeight: 1.7,
                                color: '#c8b08a',
                                marginBottom: '24px',
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            {quest.description}
                        </p>
                    )}

                    {/* Objectives */}
                    {quest.objectives && quest.objectives.length > 0 && (
                        <section className="mb-6">
                            <WowSectionTitle>Objetivos de la mision</WowSectionTitle>
                            <ul className="mt-3 space-y-1.5">
                                {quest.objectives.map((obj: string, i: number) => (
                                    <li
                                        key={i}
                                        style={{
                                            fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
                                            color: '#e8d5a8',
                                            fontSize: '14px',
                                            lineHeight: 1.5,
                                            paddingLeft: '14px',
                                            borderLeft: '2px solid #6b4c1e',
                                        }}
                                    >
                                        {obj}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* Rewards section */}
                    {(rewardItems.length > 0 || money || quest.reward_xp) && (
                        <section>
                            <WowSectionTitle>Recompensas</WowSectionTitle>

                            {/* Choice items */}
                            {choiceItems.length > 0 && (
                                <div className="mt-3 mb-2">
                                    <p style={{ color: '#9a8060', fontSize: '12px', marginBottom: '8px' }}>
                                        Podras elegir una de estas recompensas:
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {choiceItems.map((item, i) => (
                                            <WowItemBox key={i} item={item} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Fixed items */}
                            {fixedItems.length > 0 && (
                                <div className="mt-3 mb-2">
                                    {choiceItems.length > 0 && (
                                        <p style={{ color: '#9a8060', fontSize: '12px', marginBottom: '8px' }}>
                                            Tambien recibiras:
                                        </p>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                        {fixedItems.map((item, i) => (
                                            <WowItemBox key={i} item={item} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Money + XP */}
                            <div className="flex items-center gap-4 mt-4 flex-wrap" style={{ borderTop: '1px solid rgba(107,76,30,0.4)', paddingTop: '12px' }}>
                                {money && (money.gold > 0 || money.silver > 0 || money.cop > 0) && (
                                    <div className="flex items-center gap-1.5" style={{ fontSize: '14px' }}>
                                        <span style={{ color: '#9a8060' }}>También recibirás:</span>
                                        {money.gold > 0 && <><span style={{ color: '#f0c060', fontWeight: 'bold' }}>{money.gold}</span><GoldCoin /></>}
                                        {money.silver > 0 && <><span style={{ color: '#d0d0d0', fontWeight: 'bold' }}>{money.silver}</span><SilverCoin /></>}
                                        {money.cop > 0 && <><span style={{ color: '#c87533', fontWeight: 'bold' }}>{money.cop}</span><CopperCoin /></>}
                                    </div>
                                )}
                                {quest.reward_xp && quest.reward_xp > 0 && (
                                    <div style={{ fontSize: '14px', color: '#9a8060' }}>
                                        Experiencia: <span style={{ color: '#f0c060', fontWeight: 'bold' }}>{quest.reward_xp.toLocaleString('es-AR')}</span>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Completion text */}
                    {quest.completion_text && (
                        <section className="mt-6">
                            <WowSectionTitle>Al completar</WowSectionTitle>
                            <p
                                style={{
                                    fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
                                    fontSize: '14px',
                                    lineHeight: 1.7,
                                    color: '#b09870',
                                    marginTop: '10px',
                                    whiteSpace: 'pre-wrap',
                                    fontStyle: 'italic',
                                }}
                            >
                                {quest.completion_text}
                            </p>
                        </section>
                    )}

                    {/* Bottom decorative divider */}
                    <div className="flex items-center gap-3 mt-8">
                        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #6b4c1e, #c8a45e, #6b4c1e, transparent)' }} />
                        <span style={{ color: '#c8a45e', fontSize: '14px' }}>&#10022;</span>
                        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, #6b4c1e, #c8a45e, #6b4c1e, transparent)' }} />
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
            `}</style>
        </div>
    );
}

/* ---- Sub-components ---- */

function WowSectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h2
            style={{
                fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
                fontSize: '18px',
                fontWeight: 'bold',
                color: '#f0c060',
                letterSpacing: '0.5px',
                textShadow: '0 1px 6px rgba(240,192,96,0.25)',
            }}
        >
            {children}
        </h2>
    );
}

function WowItemBox({ item }: { item: any }) {
    const qualityColor = QUALITY_COLORS[item.quality] ?? '#ffffff';
    return (
        <div
            className="flex items-center gap-2 rounded p-1.5"
            style={{
                background: 'rgba(0,0,0,0.4)',
                border: `1px solid ${qualityColor}44`,
                minHeight: '52px',
            }}
        >
            {/* Icon */}
            <div
                className="rounded shrink-0 overflow-hidden flex items-center justify-center"
                style={{
                    width: '40px',
                    height: '40px',
                    border: `1px solid ${qualityColor}88`,
                    background: 'rgba(0,0,0,0.6)',
                }}
            >
                {item.iconUrl ? (
                    <img src={item.iconUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <span style={{ fontSize: '20px', opacity: 0.4 }}>?</span>
                )}
            </div>
            {/* Name */}
            <div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: qualityColor, lineHeight: 1.3 }}>
                    {item.name}
                </div>
                {item.quantity && item.quantity > 1 && (
                    <div style={{ fontSize: '11px', color: '#9a8060' }}>x{item.quantity}</div>
                )}
            </div>
        </div>
    );
}

function GoldCoin() {
    return <span title="Oro" style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', background: '#f0c060', border: '1.5px solid #b8960a', verticalAlign: 'middle' }} />;
}
function SilverCoin() {
    return <span title="Plata" style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', background: '#d0d0d0', border: '1.5px solid #999', verticalAlign: 'middle' }} />;
}
function CopperCoin() {
    return <span title="Cobre" style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', background: '#c87533', border: '1.5px solid #8b4513', verticalAlign: 'middle' }} />;
}

import { Package } from '@untitledui/icons';

interface WoWItem {
    id: number;
    name: string;
    quality: { type: string; name: string };
    media?: { id: number; url?: string };
    iconUrl?: string;
    description?: string;
    itemClass?: string;
    itemSubclass?: string;
    binding?: string;
    requiredLevel?: string;
    sellPrice?: number;
    isEquippable?: boolean;
    inventoryType?: string;
    armor?: number;
    stats?: { type: string; value: number; display?: string }[];
    weapon?: { minDamage?: number; maxDamage?: number; attackSpeedMs?: number; dps?: number; damageDisplay?: string; attackSpeedDisplay?: string; dpsDisplay?: string };
    durability?: number;
    uniqueEquipped?: string;
    spells?: { spellId?: number; spellName?: string; description: string }[];
    isStackable?: boolean;
    containerSlots?: number;
}

interface Props {
    item: WoWItem | null;
    x: number;
    y: number;
}

const QUALITY_COLORS: Record<string, string> = {
    POOR:      '#9d9d9d',
    COMMON:    '#ffffff',
    UNCOMMON:  '#1eff00',
    RARE:      '#0070dd',
    EPIC:      '#a335ee',
    LEGENDARY: '#ff8000',
    ARTIFACT:  '#e6cc80',
    HEIRLOOM:  '#00ccff',
};

const CRAFTING_KEYWORDS = ['habilidad comercial', 'profesión', 'profesion', 'reagent', 'reactivo'];

function isCraftingReagent(itemClass?: string, itemSubclass?: string): boolean {
    const cls = (itemClass ?? '').toLowerCase();
    const sub = (itemSubclass ?? '').toLowerCase();
    return CRAFTING_KEYWORDS.some(k => cls.includes(k) || sub.includes(k));
}

function goldToFormatted(copper: number) {
    const gold   = Math.floor(copper / 10000);
    const silver = Math.floor((copper % 10000) / 100);
    const cop    = copper % 100;
    return { gold, silver, cop };
}

export default function WowTooltip({ item, x, y }: Props) {
    if (!item) return null;

    const qualityType  = item.quality?.type?.toUpperCase() ?? 'COMMON';
    const qualityColor = QUALITY_COLORS[qualityType] ?? '#ffffff';
    const isReagent    = isCraftingReagent(item.itemClass, item.itemSubclass);

    const sellMoney   = (item.sellPrice && item.sellPrice > 0) ? goldToFormatted(item.sellPrice) : null;
    const hasSellPrice = sellMoney && (sellMoney.gold > 0 || sellMoney.silver > 0 || sellMoney.cop > 0);

    const weaponSpeedSec = item.weapon?.attackSpeedMs ? (item.weapon.attackSpeedMs / 1000).toFixed(2) : null;

    // Ajustar posicion usando cuadrantes para evitar saltos bruscos
    const isBottomHalf = typeof window !== 'undefined' && y > window.innerHeight / 2;
    
    const style: React.CSSProperties = {
        left: x + 15,
        top: isBottomHalf ? y - 15 : y + 15,
        transform: `${isBottomHalf ? 'translateY(-100%)' : ''}`.trim(),
    };

    return (
        <div 
            className="fixed pointer-events-none z-50"
            style={style}
        >
            <div
                className="relative shadow-2xl"
                style={{
                    background: 'rgba(5, 10, 15, 0.95)',
                    border: `1px solid ${qualityColor}88`,
                    borderRadius: '4px',
                    padding: '12px 14px',
                    width: '260px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.7), inset 0 0 10px rgba(0,0,0,0.5)'
                }}
            >
                <div style={{ display: 'flex', gap: '12px', fontSize: '13px', lineHeight: '1.45', fontFamily: 'sans-serif' }}>
                    {/* Icon Column */}
                    <div
                        style={{
                            width: '44px',
                            height: '44px',
                            flexShrink: 0,
                            border: `1px solid ${qualityColor}`,
                            borderRadius: '4px',
                            overflow: 'hidden',
                            background: 'rgba(0,0,0,0.5)',
                        }}
                    >
                        {item.iconUrl ? (
                            <img src={item.iconUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <Package className="w-6 h-6 m-auto mt-2" style={{ color: qualityColor, opacity: 0.5 }} />
                        )}
                    </div>

                    {/* Text Column */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Nombre del objeto */}
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: qualityColor, marginBottom: '2px', wordBreak: 'break-word', lineHeight: 1.2 }}>
                            {item.name}
                        </div>
                        
                        {/* Nivel Requerido */}
                        {item.requiredLevel && <Row color="#ffd100">Nivel de objeto {item.requiredLevel}</Row>}

                        {/* 1. Ligado */}
                        {item.binding && <Row color="#ffffff">{item.binding}</Row>}

                        {/* 2. Unico */}
                        {item.uniqueEquipped && <Row color="#ffffff">{item.uniqueEquipped}</Row>}

                        {item.containerSlots && item.containerSlots > 0 && (
                            <Row color="#ffffff">{item.containerSlots} espacios</Row>
                        )}

                        {isReagent && <Row color="#00ccff">Componente de creación</Row>}

                        {item.armor && item.armor > 0 && (
                            <Row color="#ffffff">{item.armor} p. de armadura</Row>
                        )}

                        {item.weapon && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ffffff' }}>
                                    <span>
                                        {item.weapon.damageDisplay
                                            ?? (item.weapon.minDamage !== undefined ? `${item.weapon.minDamage} - ${item.weapon.maxDamage} p. de daño` : '')}
                                    </span>
                                    <span>
                                        {item.weapon.attackSpeedDisplay
                                            ?? (weaponSpeedSec ? `Velocidad ${weaponSpeedSec}` : '')}
                                    </span>
                                </div>
                                {(item.weapon.dpsDisplay || item.weapon.dps) && (
                                    <Row color="#ffffff">
                                        {item.weapon.dpsDisplay ?? `(${item.weapon.dps?.toFixed(1)} p. de daño por segundo)`}
                                    </Row>
                                )}
                            </>
                        )}

                        {item.stats && item.stats.length > 0 && (
                            <div style={{ marginTop: '6px' }}>
                                {item.stats.map((s, i) => (
                                    <Row key={i} color="#ffffff">
                                        {s.display ?? `+${s.value} ${s.type}`}
                                    </Row>
                                ))}
                            </div>
                        )}

                        {item.durability && item.durability > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                <Row color="#ffffff">Durabilidad {item.durability} / {item.durability}</Row>
                            </div>
                        )}

                        {item.spells && item.spells.length > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                {item.spells.map((s, i) => (
                                    <Row key={i} color="#1eff00">{s.description}</Row>
                                ))}
                            </div>
                        )}

                        {item.description && !(item.spells?.some(s => s.description === item.description)) && (
                            <div style={{ marginTop: '8px' }}>
                                {/^(Usar|Equipar|Uso|Use|Equip):/i.test(item.description) ? (
                                    <Row color="#1eff00">{item.description}</Row>
                                ) : (
                                    <Row color="#ffd100" italic>&quot;{item.description}&quot;</Row>
                                )}
                            </div>
                        )}

                        {/* Precio de venta */}
                        {hasSellPrice && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#ffffff', marginTop: '6px' }}>
                                <span style={{ marginRight: '4px' }}>Precio de venta:</span>
                                {sellMoney!.gold   > 0 && <><span style={{ color: '#ffffff' }}>{sellMoney!.gold}</span><GoldCoin /></>}
                                {sellMoney!.silver > 0 && <><span style={{ color: '#ffffff' }}>{sellMoney!.silver}</span><SilverCoin /></>}
                                {sellMoney!.cop    > 0 && <><span style={{ color: '#ffffff' }}>{sellMoney!.cop}</span><CopperCoin /></>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Row({ children, color, italic }: { children: React.ReactNode; color: string; italic?: boolean }) {
    return (
        <div style={{ color, fontStyle: italic ? 'italic' : undefined }}>
            {children}
        </div>
    );
}

function GoldCoin() {
    return <img src="https://wow.zamimg.com/images/icons/money-gold.gif" alt="Oro" style={{ display: 'inline-block', width: '13px', height: '13px', verticalAlign: 'middle', marginLeft: '2px', marginRight: '4px' }} />;
}
function SilverCoin() {
    return <img src="https://wow.zamimg.com/images/icons/money-silver.gif" alt="Plata" style={{ display: 'inline-block', width: '13px', height: '13px', verticalAlign: 'middle', marginLeft: '2px', marginRight: '4px' }} />;
}
function CopperCoin() {
    return <img src="https://wow.zamimg.com/images/icons/money-copper.gif" alt="Cobre" style={{ display: 'inline-block', width: '13px', height: '13px', verticalAlign: 'middle', marginLeft: '2px' }} />;
}

/**
 * Geometria dei grafici.
 *
 * Solo calcolo: nessun disegno e nessun colore. I colori arrivano dai token del
 * tema, e ogni grafico dell'app e' accompagnato da un'**alternativa tabellare**
 * con unita' e periodo dichiarati (§13.1 e §9.1: uno stato non si distingue
 * solo dal colore, e un grafico non e' leggibile con uno screen reader).
 *
 * Nessuna interpolazione: i punti mancanti non esistono, non vengono inventati
 * (§13.2).
 */

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

export interface ChartSeries {
  readonly label: string;
  readonly points: readonly ChartPoint[];
}

export interface ChartGeometry {
  readonly width: number;
  readonly height: number;
  readonly paddingLeft: number;
  readonly paddingRight: number;
  readonly paddingTop: number;
  readonly paddingBottom: number;
}

export const DEFAULT_GEOMETRY: ChartGeometry = {
  width: 320,
  height: 160,
  paddingLeft: 8,
  paddingRight: 8,
  paddingTop: 12,
  paddingBottom: 12,
};

export interface ChartScale {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  project(point: ChartPoint): ChartPoint;
}

/**
 * Scala sui dati realmente presenti.
 *
 * L'asse Y **non** parte forzatamente da zero: per una grandezza che varia di
 * poco attorno a un valore alto (il peso corporeo e' il caso tipico) partire da
 * zero rende invisibile qualunque variazione reale. Il dominio effettivo e'
 * dichiarato accanto al grafico, cosi' la scelta e' ispezionabile invece di
 * essere nascosta.
 */
export function buildScale(
  series: readonly ChartSeries[],
  geometry: ChartGeometry = DEFAULT_GEOMETRY,
): ChartScale | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;

  for (const s of series) {
    for (const p of s.points) {
      count += 1;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (count === 0) return null;

  const spanX = maxX - minX === 0 ? 1 : maxX - minX;
  const spanY = maxY - minY === 0 ? 1 : maxY - minY;
  const innerWidth = geometry.width - geometry.paddingLeft - geometry.paddingRight;
  const innerHeight = geometry.height - geometry.paddingTop - geometry.paddingBottom;

  return {
    minX,
    maxX,
    minY,
    maxY,
    project: (point) => ({
      x: geometry.paddingLeft + ((point.x - minX) / spanX) * innerWidth,
      y: geometry.paddingTop + innerHeight - ((point.y - minY) / spanY) * innerHeight,
    }),
  };
}

/**
 * Percorso SVG di una spezzata.
 *
 * I segmenti collegano punti **consecutivi realmente osservati**: se fra due
 * osservazioni ci sono giorni senza dati la linea li attraversa, e il numero di
 * osservazioni e' sempre mostrato accanto al grafico perche' la differenza sia
 * evidente.
 */
export function linePath(points: readonly ChartPoint[], scale: ChartScale): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  points.forEach((point, index) => {
    const p = scale.project(point);
    parts.push(`${index === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  });
  return parts.join(' ');
}

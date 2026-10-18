import { useWindowDimensions } from 'react-native';

// Layout sizes that follow the screen. 390 dp is the reference width the design
// was drawn for; smaller phones shrink type and spacing a little, bigger ones
// grow them a little (capped, so a tablet doesn't get giant text: wide screens
// get a centred, width-limited column instead, see MAX_CONTENT_WIDTH).

const REFERENCE_WIDTH = 390;
export const MAX_CONTENT_WIDTH = 560;

export function useResponsive() {
  const { width } = useWindowDimensions();
  // The content column never gets wider than MAX_CONTENT_WIDTH, so scale by that.
  const usable = Math.min(width, MAX_CONTENT_WIDTH);
  const scale = Math.min(1.12, Math.max(0.8, usable / REFERENCE_WIDTH));

  return {
    width,
    scale,
    compact: width < 340,                         // small phones
    pad: width < 340 ? 14 : width < 380 ? 16 : 20, // page side padding
    rs: (size) => Math.round(size * scale),       // scale a font size / dimension
  };
}

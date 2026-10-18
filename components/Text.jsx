import { Text as RNText, TextInput as RNTextInput } from 'react-native';

// Every piece of text in the app goes through these instead of the plain React
// Native ones, for two reasons:
//
//  1. Phones can scale all text up (Settings -> Display -> Font size). Without a
//     limit, large text overflows its card. Capping the scale at 1.3x keeps text
//     readable while letting layouts cope (long text wraps, numbers shrink to fit).
//  2. FitText is for values that must stay on one line (big numbers, prices): if
//     they don't fit their space they shrink instead of being cut off.

const MAX_FONT_SCALE = 1.3;

export function Text({ maxFontSizeMultiplier = MAX_FONT_SCALE, ...props }) {
  return <RNText maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
}

export function TextInput({ maxFontSizeMultiplier = MAX_FONT_SCALE, ...props }) {
  return <RNTextInput maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
}

// One line, shrinks (down to `minScale` of its size) rather than overflow or wrap.
// Give it a parent that can shrink (flexShrink: 1 / flex: 1 / minWidth: 0).
export function FitText({ minScale = 0.5, style, ...props }) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={minScale}
      style={style}
      {...props}
    />
  );
}

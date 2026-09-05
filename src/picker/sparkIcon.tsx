import React from 'react';
import { View } from 'react-native';

/**
 * The finder's mark, DRAWN rather than typed.
 *
 * The reference paints `Icons.auto_awesome_rounded` at sixteen points on the
 * collapsed bar's `Find seats` button: ONE broad four-pointed star with a
 * smaller one above-right and another below-right. A single typed `✦` is one
 * star, and a narrower one — measured against the reference frame it left the
 * whole button eight points short, which walks every glyph in the label out of
 * place. So the mark is built out of Views, exactly as the accessibility marks
 * are.
 *
 * Geometry, measured off the reference frame at 390×844 @3x and expressed as
 * fractions of the icon's own box so any size draws the same mark:
 *
 * | part        | centre            | box    |
 * | ----------- | ----------------- | ------ |
 * | broad star  | .3856 w, .5 h     | .53125 |
 * | upper star  | .8125 w, .2083 h  | .25    |
 * | lower star  | .8125 w, .7917 h  | .25    |
 *
 * A four-pointed star is a square whose four edges are bitten concave. Each
 * star is therefore a filled square with four discs of the GROUND colour set
 * at its diagonals — centre ±1.15 of the star's own side, radius 1.325 of it,
 * which is the arc the reference's own outline follows to within a third of a
 * point. The ground must therefore be handed in: this mark can only be drawn
 * over a flat fill, which is the only place the reference draws it.
 */
export function SeatLayerPickerSparkIcon({ color, ground, size = 16 }: Readonly<{
  /** The mark's ink. */
  color: string;
  /** The flat fill the mark sits on; the concave bites are painted in it. */
  ground: string;
  size?: number;
}>): React.ReactElement {
  return (
    <View accessible={false} style={{ height: size, width: size }}>
      <Star color={color} ground={ground} side={size * .53125} x={size * .3856} y={size * .5} />
      <Star color={color} ground={ground} side={size * .25} x={size * .8125} y={size * .2083} />
      <Star color={color} ground={ground} side={size * .25} x={size * .8125} y={size * .7917} />
    </View>
  );
}

/** Distance from a star's centre to each biting disc's own centre, in sides. */
const biteCentre = 1.15;
/** Radius of a biting disc, in sides of the star it bites. */
const biteRadius = 1.325;

function Star({ color, ground, side, x, y }: Readonly<{
  color: string;
  ground: string;
  side: number;
  x: number;
  y: number;
}>): React.ReactElement {
  const disc = side * biteRadius * 2;
  return (
    <View
      accessible={false}
      style={{
        backgroundColor: color,
        height: side,
        left: x - side / 2,
        overflow: 'hidden',
        position: 'absolute',
        top: y - side / 2,
        width: side,
      }}
    >
      {corners.map(([sx, sy]) => (
        <View
          key={`${sx}:${sy}`}
          style={{
            backgroundColor: ground,
            borderRadius: disc / 2,
            height: disc,
            left: side * (.5 + sx * biteCentre - biteRadius),
            position: 'absolute',
            top: side * (.5 + sy * biteCentre - biteRadius),
            width: disc,
          }}
        />
      ))}
    </View>
  );
}

const corners: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

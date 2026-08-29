import type { PointerEvent } from "react"
import { getPrimaryComponentPosts } from "@/browser/editor/post-endpoints"
import { getPinPosts } from "@circuit-sim/core/circuit/component-geometry"
import type { Component, Point } from "@circuit-sim/core/circuit/project"

type PinLayerProps = {
  interactive: boolean
  pinMode?: "all" | "primary-posts"
  components: ReadonlyArray<Component>
  onPinPointerDown: (
    componentId: string,
    pin: string,
    position: Point,
    event: PointerEvent<SVGCircleElement>,
  ) => void
}

export function PinLayer({
  interactive,
  pinMode = "all",
  components,
  onPinPointerDown,
}: PinLayerProps) {
  return (
    <g className={interactive ? "pin-layer" : "pin-layer inactive"}>
      {components.flatMap((component) =>
        componentPinsForMode(component, pinMode).map((pin) => (
          <circle
            key={`${component.id}-${pin.pin}`}
            className="pin"
            cx={pin.position.x}
            cy={pin.position.y}
            r={5}
            onPointerDown={(event) =>
              onPinPointerDown(component.id, pin.pin, pin.position, event)
            }
          />
        )),
      )}
    </g>
  )
}

function componentPinsForMode(
  component: Component,
  pinMode: NonNullable<PinLayerProps["pinMode"]>,
) {
  return pinMode === "primary-posts"
    ? getPrimaryComponentPosts(component)
    : getPinPosts(component)
}

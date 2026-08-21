import {
  leadAnnotationBodyRects,
  leadAnnotationBounds,
} from "./lead-annotation-geometry"
import type { NetLabelObject, ProbeObject } from "./types"

describe("lead annotation geometry", () => {
  it("includes net label body width in annotation bounds", () => {
    const label: NetLabelObject = {
      kind: "net-label",
      id: "label_bounds",
      text: "BUS",
      position: { x: 20, y: 0 },
      leadEnd: { x: 40, y: 0 },
    }

    expect(leadAnnotationBodyRects(label)).toEqual([
      { x: 40, y: -7, width: 54, height: 14 },
    ])
    expect(leadAnnotationBounds(label)).toEqual({
      x: 20,
      y: -7,
      width: 74,
      height: 14,
    })
  })

  it("includes probe circle and label body in annotation bounds", () => {
    const probe: ProbeObject = {
      kind: "probe",
      id: "probe_bounds",
      probeType: "voltage",
      name: "VP1",
      position: { x: 0, y: 0 },
      leadEnd: { x: 30, y: 0 },
    }

    expect(leadAnnotationBodyRects(probe)).toEqual([
      { x: 19, y: -11, width: 22, height: 22 },
      { x: 6, y: 16, width: 48, height: 16 },
    ])
    expect(leadAnnotationBounds(probe)).toEqual({
      x: 0,
      y: -11,
      width: 54,
      height: 43,
    })
  })
})

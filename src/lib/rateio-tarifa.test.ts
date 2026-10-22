import { describe, expect, it } from "vitest";
import { tarifaPorLinha } from "./rateio-tarifa";

describe("tarifa da baixa por item", () => {
  it("sem tarifa cadastrada não abate nada", () => expect(tarifaPorLinha(0, [100, 50])).toEqual([0, 0]));
  it("divide proporcional e fecha no centavo", () => expect(tarifaPorLinha(1, [100, 100, 100])).toEqual([0.33, 0.33, 0.34]));
});

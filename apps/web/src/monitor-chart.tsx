import { useId } from "react";
import type { MetricResult } from "../../../packages/core/src/monitoring";
export function MonitorChart({ result }: { result: MetricResult }) {
  const id = useId();
  if (result.shape === "cohort")
    return (
      <div className="table-wrap">
        <table>
          <caption>Provider cohort results · {result.unit}</caption>
          <thead>
            <tr>
              <th>Cohort</th>
              {result.columns?.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows?.map((r, i) => (
              <tr key={i}>
                <th>{r.label}</th>
                {r.values.map((v, j) => (
                  <td key={j}>{v ?? "No data"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  const series = [...new Set(result.points.map((p) => p.series || ""))];
  return (
    <>
      {series.map((name, seriesIndex) => {
        const points = result.points.filter((p) => (p.series || "") === name),
          numbers = points.map((p) =>
            p.value == null ? null : Number(p.value),
          );
        const max = Math.max(1, ...numbers.map((n) => n ?? 0)),
          min = Math.min(0, ...numbers.map((n) => n ?? 0));
        const y = (n: number) => 12 + (160 * (max - n)) / (max - min),
          step = 550 / Math.max(1, points.length),
          zero = y(0);
        return (
          <div key={name}>
            {name && <p className="muted text-xs">{name}</p>}
            <svg
              className="monitor-chart"
              viewBox="0 0 640 220"
              role="img"
              aria-labelledby={`${id}-${seriesIndex}`}
            >
              <title id={`${id}-${seriesIndex}`}>
                Provider {result.shape} values; missing values are blank. Exact
                values follow in the table.
              </title>
              {[max, (max + min) / 2, min].map((n) => (
                <g key={n}>
                  <line
                    x1="70"
                    x2="630"
                    y1={y(n)}
                    y2={y(n)}
                    className="chart-grid"
                  />
                  <text x="62" y={y(n) + 4} textAnchor="end">
                    {n.toLocaleString(undefined, {
                      maximumSignificantDigits: 4,
                    })}
                  </text>
                </g>
              ))}
              {points.map((p, i) => {
                const number = numbers[i];
                if (number == null || !Number.isFinite(number)) return null;
                const x = 75 + step * i;
                return (
                  <g key={i}>
                    <rect
                      className="chart-bar"
                      x={x}
                      y={Math.min(y(number), zero)}
                      width={Math.max(1, step - 2)}
                      height={Math.max(
                        number === 0 ? 1 : 2,
                        Math.abs(zero - y(number)),
                      )}
                    >
                      <title>
                        {p.label}: {p.value} {result.currency || result.unit}
                      </title>
                    </rect>
                    {(i === 0 ||
                      i === points.length - 1 ||
                      i === Math.floor(points.length / 2)) && (
                      <text x={x} y="198">
                        {p.label.length > 12 ? p.label.slice(0, 12) : p.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
      <details className="chart-data">
        <summary>View exact values</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{result.shape === "funnel" ? "Step" : "Date"}</th>
                <th>Series</th>
                <th>{result.currency || result.unit}</th>
              </tr>
            </thead>
            <tbody>
              {result.points.map((p, i) => (
                <tr key={i}>
                  <td>{p.label}</td>
                  <td>{p.series || "—"}</td>
                  <td>{p.value ?? "No data"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

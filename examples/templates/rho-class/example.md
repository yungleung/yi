---
title: Seeing Structure in a Noisy Sky
author:
  - name: Mira Chen
    affiliation: Department of Physics, Northshore University
    email: mira.chen@northshore.example
    affil: a
    affil-note: "*,a"
  - name: Elias Ward
    affiliation: Institute for Observational Science, Kestrel College
    email: elias.ward@kestrel.example
    affil: b
    affil-note: b
  - name: Noor Patel
    affiliation: Laboratory for Data Astronomy, Lakeview University
    email: noor.patel@lakeview.example
    affil: c
    affil-note: c
date: Manuscript prepared 23 October 2026
abstract: |
  Small observatories increasingly combine inexpensive sensors with careful
  statistical design. We describe a reproducible workflow for separating a
  weak sky signal from correlated instrumental drift, and show how uncertainty
  budgets change when calibration observations are shared across detectors.
keywords:
  - sensor calibration
  - time-domain astronomy
  - uncertainty
doctype: Research Article
journal-name: Open Research Letters
journal: Northshore University
journal-date: October 2026
volume: 8
issue: 2
corresponding-email: mira.chen@northshore.example
corresponding-note: "*"
docinfo: This article was prepared with the Rho Class template. Template design by Guillermo Jimenez, used under CC BY 4.0.
---

# Introduction

Low-cost detectors have changed who can collect time-domain observations, but
they have not changed the inferential problem. A measured fluctuation contains
sky signal, atmospheric structure, electronic drift and photon noise. Separating
those terms requires a model whose flexibility is visible in the final
uncertainty budget [@example2024].

This article presents a compact analysis pattern for a modest array of
calibrated sensors. The central idea is to estimate shared systematics from
calibration paths that do not pass through the scientific target. The result is
not a new instrument, but a transparent route from raw samples to a defensible
limit.

# Observing Model

Let $d_i(t)$ be the calibrated residual for detector $i$. We model it as

$$
d_i(t)=s(t)+a_i(t)+\epsilon_i(t),
$$

where $s(t)$ is the common sky term, $a_i(t)$ describes detector-specific
drift, and $\epsilon_i(t)$ is noise. The shared signal is estimated from the
weighted mean

$$
\hat{s}(t)=\frac{\sum_i w_i d_i(t)}{\sum_i w_i},
\qquad
w_i=\frac{1}{\sigma_i^2}.
$$

The approximation is useful only while the calibration transfer functions are
stable over the interval being combined.

::: {.callout .callout-note}
Shared drifts are treated as common-mode signal. A detector whose drift
departs from the array median is excluded before the sky model is fitted,
and that exclusion is recorded in the result.
:::

# Data and Calibration

The example uses six channels sampled once per minute over a synthetic
three-hour observation. Every twentieth sample is replaced by a calibration
measurement from a stable reference source. The reference route is deliberately
independent of the sky path, which makes the calibration residual available as
a diagnostic rather than an assumption.

![Residuals from the six-channel demonstration. The common mode is removed before the weighted mean is formed.](figures/sensor-residuals.pdf)

Table 1 summarizes the channel weights and the resulting uncertainty before and
after shared calibration.[^weights]

| Channel | Samples | Weight | Raw $1\sigma$ | Calibrated $1\sigma$ |
| --- | ---: | ---: | ---: | ---: |
| A | 180 | 0.21 | 4.8 | 3.1 |
| B | 180 | 0.18 | 5.2 | 3.4 |
| C | 178 | 0.17 | 5.4 | 3.5 |
| D | 180 | 0.16 | 5.6 | 3.7 |
| E | 179 | 0.15 | 5.9 | 3.9 |
| F | 180 | 0.13 | 6.2 | 4.1 |

: Channel weights and uncertainty before and after the shared calibration model.

[^weights]: Values are illustrative and use arbitrary signal units.

# Algorithm

The complete reduction is intentionally short enough to inspect:

```python
def calibrated_mean(channels, calibration):
    corrected = {
        name: samples - calibration[name]
        for name, samples in channels.items()
    }
    weights = {
        name: 1.0 / variance(samples)
        for name, samples in corrected.items()
    }
    return weighted_mean(corrected, weights)
```

The workflow records every subtraction and every weight. When a channel is
rejected, the output keeps both the reason and the resulting change in the
posterior interval.

# Results

The calibrated weighted mean reduces the standard error by roughly one third
relative to the uncalibrated estimate. Figure 1 shows that the largest
improvement occurs where the raw channels share a slow drift. The improvement
is smaller near the end of the interval, where the reference source contributes
additional photon noise.

The posterior width is

$$
\sigma_{\mathrm{post}}=
\left(\sum_i \frac{1}{\sigma_{\mathrm{raw},i}^2+
\sigma_{\mathrm{cal},i}^2}\right)^{-1/2},
$$

and therefore cannot be reduced by adding correlated channels indefinitely.
This is the main lesson of the demonstration: calibration buys sensitivity only
until the shared reference noise becomes the limiting term.

# Discussion

Rho Class keeps the method and its uncertainty close together. The narrow grid
supports short paragraphs and equations without turning the article into a
technical report. The callout box is a useful place to expose an assumption
rather than hiding it in a method paragraph.

::: {.callout .callout-info title="Information"}
Rho's `info` environment is for reference material that helps the reader
interpret a method without interrupting the main argument.
:::

A production analysis would replace the synthetic residuals with archived
engineering data, propagate the reference-source covariance, and test the
calibration model against an independent night. None of those extensions
changes the structure shown here.

# Conclusion

A modest sensor array can produce a useful measurement when shared
systematics are estimated explicitly. The template accompanies the example so
the same title block, two-column grid, code treatment and uncertainty-focused
prose can be reused for another note.

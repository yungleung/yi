---
title: Models, Agents, and the Harness Between Them
subtitle: A practical map of the layers that turn an LLM into a working system
author: Yi Documentation
date: 2026-10-22
description: A brief technical guide to large language models, AI agents, and the harness that coordinates them.
lang: en
keywords:
  - large language models
  - AI agents
  - harness engineering
---

# The three layers

A large language model is not an agent, and an agent is not merely a prompt wrapped around a
model. The useful distinction has three layers: the model produces a continuation, the agent adds a
goal and a loop, and the harness supplies the environment in which that loop can operate safely.

Keeping those layers separate makes system design clearer. A model failure is not automatically an
agent failure, and a bad tool call is often a harness problem rather than evidence that the model
"cannot reason."

## The model

An LLM is a statistical function over tokens. Given a sequence, it assigns probabilities to possible
next tokens and samples from them. Everything else in a chat system is built around that operation.

The model has no durable memory between calls and no intrinsic awareness of the outside world. Its
working context is the text supplied for the current inference. The apparent memory of an assistant
comes from software that stores earlier messages and sends selected parts back into that context.

## The agent

An AI agent is a control loop built around a model. It receives a goal, chooses an action, observes
the result, and repeats until it can answer or must stop. Tool calls make the loop consequential:
the agent can search, read files, run tests, query a database, or send a request.

The model still only proposes an action. The surrounding software decides whether that proposal is
allowed, how it is executed, what result returns to the model, and when the loop ends.

# What an LLM actually does

LLM behavior is easiest to understand as constrained prediction over a context window.

## Tokens and probabilities

The prompt, conversation history, retrieved documents, tool schemas, and observations all compete
for space in the context. The model converts them into tokens and predicts a continuation. Sampling
settings such as temperature change the selection process, but they do not add knowledge or
guarantee correctness.

This explains a common failure: the model can produce a fluent answer from incomplete evidence.
Fluency measures the shape of the continuation, not the truth of the claim.

## Context is working memory

Context engineering is therefore part of system engineering. The harness must decide what the model
needs now, what can be summarized, and what should be retrieved again later. Stuffing every available
document into the prompt increases cost and can bury the evidence that matters.

### A note on plausibility

When an answer sounds confident, inspect the evidence path. Did the model receive the source, or did
it fill a gap with a plausible continuation? A system that records tool inputs and outputs can answer
that question; a transcript of prose alone usually cannot.

# From model to agent

The transition from model to agent is the transition from one prediction to a sequence of decisions
with feedback.

## Tools turn text into action

A tool is an interface between probabilistic output and deterministic software. A well-designed tool
has a narrow purpose, explicit input schema, bounded side effects, and a result the model can inspect.
"Run this command" is not a tool contract; "run these tests in this repository and return stdout,
stderr, and the exit code" is.

Tool descriptions matter, but validation matters more. The harness should reject malformed
arguments, constrain paths, enforce time limits, and report failures in a form the agent can act on.

## State and control

An agent needs state outside the model: the current goal, completed steps, pending questions, files
changed, and evidence collected. The harness also owns control decisions such as maximum steps,
retry policy, cancellation, and the conditions under which a human must approve an action.

Those decisions should not be hidden in a prompt. Prompts can guide behavior; code should enforce
boundaries.

# The harness

The harness is the software layer that makes an agent repeatable and inspectable. It constructs the
model context, exposes tools, executes the loop, records events, and enforces policy.

## What belongs in a harness

A useful harness usually owns:

- model routing and request construction;
- context selection and compaction;
- tool registration, validation, and execution;
- retries, timeouts, cancellation, and budget limits;
- permission checks and approval gates;
- logging, tracing, and artifact capture;
- evaluation hooks and regression tests.

This is also where product behavior lives. Two systems may use the same model and the same tools but
feel completely different because one preserves useful state, reports failures clearly, and knows
when to stop.

## Why harness quality dominates

Agent reliability is often limited by coordination rather than raw model capability. If a tool returns
an opaque error, if context is truncated without a summary, or if the loop retries a destructive
action, a stronger model may only fail more efficiently.

A good harness reduces the space of bad outcomes. It turns ambiguity into explicit state, turns tool
results into usable observations, and turns an unbounded process into a budgeted one.

# The agent loop

A typical loop has six stages:

1. Assemble the goal, state, available tools, and relevant evidence.
2. Ask the model for a response or action.
3. Validate the action against policy and schema.
4. Execute the tool or ask for missing input.
5. Record the observation and update state.
6. Continue, answer, or stop at a defined boundary.

The simplicity is deceptive. Most production work happens around step two: deciding what evidence to
include, and around steps three through five: making execution safe and its results legible.

> The model proposes. The harness decides what is possible, what happened, and what the next context
> contains.

# Evaluating an agent system

Evaluate the model, the agent loop, and the harness separately.

## Separate model failures from system failures

Model evaluations can test knowledge, instruction following, extraction, or tool selection in a
controlled context. Agent evaluations should add realistic state, multiple turns, and observations.
Harness tests should prove deterministic rules: denied paths stay denied, retries do not duplicate
side effects, context budgets are respected, and failures are reported without losing artifacts.

Keep traces as test data. A recorded sequence of prompts, actions, tool results, and final answers can
become a regression case when the system changes.

## Measure outcomes and process

Outcome metrics such as task success and human acceptance are necessary, but they are not sufficient.
Also measure steps, latency, token use, tool-error rate, approval frequency, and recovery after
failure. These reveal whether success came from a robust loop or from luck.

# A useful mental model

The LLM is a powerful continuation engine. The agent is a goal-directed loop. The harness is the
operating environment that connects prediction to action without pretending either is magic.

When an agent misbehaves, inspect all three layers. Ask what the model saw, what the loop allowed, and
what the harness made observable. That diagnosis is more useful than asking the model to "try harder"
in the next prompt.

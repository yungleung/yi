---
id: 20221031105857
---
# 6 Bayesian Game

## Introduction
So far, we've assumed that all players know what game is being played. Everyone knows:
- the number of players
- the actions available to each other
- the payoff associate with each action vector

Why is this true in imperfect information games?

Now we'll relax this. We'll still assume:
1. All possible games have the same number of agents and the same strategy space for each agent; differing only in payoffs.
2. Agents' beliefs are posteriors, obtained by conditioning a common prior on individual private signals.

## Definition 1: Information Sets
**Bayesian game**: a set of games that differ only in their payoffs, a common prior defined over them, and a partition structure over the games for each agent.

**Definition (Bayesian Game: Information Sets)**
: A **Bayesian game** is a tuple $(N,G,P,I)$ where
- $N$ is a set of agents,
- $G$ is a set of games with $N$ agents each such that if $g,g' \in G$ then for each agent $i \in N$ the strategy space in $g$ is identical to the strategy space in $g'$.
- $P \in \prod(G)$ is a common prior over games, where $\prod(G)$ is the set of all probability distributions over $G$, and
- $I = (I_1,\ldots I_N)$ is a set of partitions of $G$, one for each agent. This is going to be a set of equivalence classes that will say from the point of view of an agent, certain games are indistinguishable form each other.

![Bayesian Games Definition 1 example.png](Bayesian Games Definition 1 example.png)
MP: matching pennies,
PD: prisoners' dilemma,
Coord: coordination,
BoS: battle of the sexes.

Our assumption is that for each game the agents have the same actions.  So, let's say player 1 gets to choose the top or bottom, and player 2 left or right.

What is interesting here is that each player has different information sets. So player 1 gets to find out which of these two sets the game is in. Nature decide which game gets played according the common prior. Supposing BoS is played, player 1 will  find out that he is in a equivalence class, but cannot distinguish Coor or BoS. player w will found that he is in a different equivalence class. The ground truth would be in fact Battle of the Sexes was being played. He would consider it possible that Prisoner's Dilemma was being played. And we've already seen that player one would consider it possible The Coordination was being played. And what this means is that when the players are deciding what action to take, they're going to have to play an action without fully knowing what game is going to be played. And they're going to have to reason about what their opponent is doing without fully knowing what the opponent is going to think. They will, they do know everything about the setup. So this whole kind of picture is something that the players know. They know the common prior. They know their own equivalence classes and they know their opponent's equivalence classes.

## Definition 2: Epistemic Types
Directly represent uncertainty over utility function using the notion of **epistemic type**.

Definition
: A **Bayesian game** is a tuple $(N,A,\Theta,p,u)$ where
- $N$ is a set of agents,
- $A=(A_1,\ldots,A_n)$, where $A_i$ is the set of actions available to player $i$,
- $\Theta = (\Theta_1, \ldots, \Theta_n)$, where $\Theta_i$ is the type space of player $i$, the type of the agent is supposed to capture everything that is private information to the agent.
- $p: \Theta \mapsto [0, 1]$ is the common prior over types,
- $u = (u_1, \ldots, u_n)$, where $u_i: A \times \Theta \mapsto \mathbb{R}$ is the utility function for player $i$.

![Bayesian Games definition 2 Example.png](Bayesian Games definition 2 Example.png)

## Analyzing Bayesian Games
### Bayesian (Nash) Equilibrium
A plan of action for each player as a function of types that maximize each type's expected utility:
- expecting over the actions of other players,
- expecting over the types of other players.

### Strategies
Given a Bayesian game $G(N,A,\Theta,p,u)$ with finite set of players, actions, and types, strategies are defined as follows:

**Pure strategy**: $s_i : \Theta_i \mapsto A_i$
-  a choice of a pure action for player $i$ as a function of his or her type.

**Mixed strategy**: $s_i : \Theta_i \mapsto \prod(A_i)$
- a choice of a mixed action for player $i$ as a function of his or her type.

$s_i(a_i | \theta_i)$
- the probability under mixed strategy $s_i$ that agent $i$ plays action $a_i$, given that $i$'s type $\theta_i$.

### Expected Utility
Three standard motion of expected utility:

**ex-ante**
: the agent knows nothing about anyone's actual type;

**interim**
: an agent knows her own type but not the types of the other agents;

**ex-post**
: the agent knows all agents' types.

#### Interim expected utility
Given a Bayesian game $G(N,A,\Theta,p,u)$ with finite sets of players, actions, and types, $i$'s **interim expected utility** with respect to type $\theta_i$ and a mixed strategy profile $s$ is 
$$
EU_i(s|\theta_i) = \sum_{\theta_{-i} \in \Theta_{-i}}p(\theta_{-i}|\theta_i)\sum_{a \in A}\left(\prod_{j \in N}s_j(a_j | \theta_j)\right)u_i(a_i,\theta_i,\theta_{-i})
$$
$i$'s **ex ante expected utility** with respect to a mixed strategy profile $s$ is
$$
EU_i(s) = \sum_{\theta_i \in \Theta_i}p(\theta_i)EU_i(s|\theta_i).
$$
### Bayesian Equilibrium or Bayes-Nash equilibrium
A **Bayesian equilibrium** is a mixed strategy profile $s$ that statisfies
$$
s_i \in \arg \max_{s'_i} EU_i(s'_i,s_{-i}|\theta_i)
$$
for each $i$ and $\theta_i \in \Theta_i$.

The above is defined based on interim maximization. It is equivalent to an ex ante formulation:

If $p(\theta_i) \gt 0$ for all $\theta_i \in \Theta_i$, then this is equivalent to requiring that
$$
s_i \in \arg \max_{s'_i} EU(S'_i,s_{-i}) = \arg \max_{s'_i}\sum_{\theta_i}p(\theta_i)EU_i(s'_i,s_{-i}|\theta_i)
$$
for each $i$.

- Explicitly models behavior in an uncertain environment
- Players choose strtegies to maximize their payoffs in response to others accounting for:
    * strategic uncertainty about how others will play and 
    * payoff uncertainty about the value to their actions

## Analyzing Bayesian Games: Another Example
### Bayesian (Nash) Equilibrium
A plan of action for each player as a function of types that maximize each type's expected utility:
- expecting over the actions of other players,
- expecting over the types of other players.

### A Sheriff's Dilemma
A sheriff is faced an armed suspect and they each must (simultaneously) decide whether to shoot the other or not, and:

- the suspect is either a criminal with probability $p$ or not with probability $1-p$.
- the sheriff would rather shoot if the suspect shoots, but not if the suspect does not.
- the criminal would rather shoot even if the sheriff does not, as the criminal would be caught if does not shoot.
- the innocent suspect would rather not shoot even if the sheriff shoots.

![A sheriff dilemma.png](A sheriff dilemma.png)

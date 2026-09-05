#!/usr/bin/env python3

"""

Simplified Maze Demonstration Program

Shows the movement of a small ball in the maze

NOTE (browser integration): this standalone pygame window is now also
visible inside the live system as the "Maze Demo" tab under
Research & Analysis (see index.html + maze-demo.js at the project
root). That in-app version currently uses a placeholder shortest-path
search instead of the real trained policy, because this script's three
imports below are not present anywhere in this repository:
  - dynamic_maze_env.DynamicMazeEnv
  - baseline_confidence_agent.BaselineConfidenceAgent
  - reflection_agent.ReflectionAgent
Add those three modules to this folder (or wherever they live) to run
this script locally with pygame, and port their actual step/learn
logic into maze-demo.js to replace the browser placeholder with the
real agent behavior.

"""



import pygame

import numpy as np

import sys

import os



# Ensure the current directory is in the Python path

sys.path.append(os.path.dirname(os.path.abspath(__file__)))



from dynamic_maze_env import DynamicMazeEnv

from baseline_confidence_agent import BaselineConfidenceAgent

from reflection_agent import ReflectionAgent



class SimpleMazeVisualization:

    def __init__(self, width=1000, height=600):

        pygame.init()
        self.width = width
        self.height = height
        self.screen = pygame.display.set_mode((width, height))
        pygame.display.set_caption("Maze Demonstration - Ball Moving in Maze")
    
        # Grid settings
        self.grid_size = 10
        self.cell_size = min(width, height - 100) // self.grid_size
        # We manually set the x-offset to 350 to push the maze to the right
        self.grid_offset_x = 350
        self.grid_offset_y = (height - 100 - self.cell_size * self.grid_size) // 2
       
        # Colors
        self.WHITE = (255, 255, 255)
        self.BLACK = (0, 0, 0)
        self.GRAY = (128, 128, 128)
        self.RED = (255, 0, 0)      # Baseline agent
        self.BLUE = (0, 0, 255)     # Reflection agent
        self.GREEN = (0, 255, 0)    # Goal
        self.YELLOW = (255, 255, 0) # Walls
       
        # Font settings
        pygame.font.init()
        self.font = pygame.font.Font(None, 24)
       
        # Running state
        self.running = True
        self.paused = False
        self.last_action_text = "None"
        self.episode_num = 1
        self.status_text = "Press ENTER to start Episode 1"
        self.waiting_for_input = True # Control flag
       
        # --- PUT THEM HERE ---
        self.steps_taken = 0
        self.goal_status = "In Progress..."

    def draw_maze(self, maze, agent_pos, goal_pos):

        """Draw the maze"""
        self.screen.fill(self.WHITE)
    
        # Draw the grid
        for i in range(self.grid_size):
            for j in range(self.grid_size):
                x = self.grid_offset_x + j * self.cell_size
                y = self.grid_offset_y + i * self.cell_size

                # Draw the cell
                if maze[i][j]:  # Walls
                    pygame.draw.rect(self.screen, self.YELLOW,
                                   (x, y, self.cell_size, self.cell_size))
                else:  # Empty space
                    pygame.draw.rect(self.screen, self.WHITE,
                                   (x, y, self.cell_size, self.cell_size))
            
                # Draw grid lines
                pygame.draw.rect(self.screen, self.GRAY,
                               (x, y, self.cell_size, self.cell_size), 1)

                # Draw the agent (ball)
                if i == agent_pos[0] and j == agent_pos[1]:
                    pygame.draw.circle(self.screen, self.RED,
                                    (x + self.cell_size//2, y + self.cell_size//2),
                                    self.cell_size//3)
              
                # Draw the goal
                if i == goal_pos[0] and j == goal_pos[1]:
                    pygame.draw.circle(self.screen, self.GREEN,
                                    (x + self.cell_size//2, y + self.cell_size//2),
                                    self.cell_size//3)
       
        # Draw instruction text
        info_text = [
            "Maze Demonstration - Ball Moving in Maze",
            f"Episode: {self.episode_num}",
            f"Status: {self.status_text}",
            f"Goal Result: {self.goal_status}", # <--- ADD THIS
            f"Steps Taken: {self.steps_taken}/100", # <--- ADD THIS
            f"Last Action: {self.last_action_text}",
            "---",
            "Red Ball: Baseline Agent",
            "Green Circle: Goal",
            "Yellow Blocks: Walls",
            "Spacebar: Pause/Resume",
            "ESC Key: Exit"
        ]

        for i, text in enumerate(info_text):
            text_surface = self.font.render(text, True, self.BLACK)
            self.screen.blit(text_surface, (20, 20 + i * 25))
       
        pygame.display.flip()


    def handle_events(self):
        """Handle events"""
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    self.paused = not self.paused
                elif event.key == pygame.K_RETURN:
                    self.waiting_for_input = False
                elif event.key == pygame.K_ESCAPE:
                    self.running = False
        return self.running

def main():
    """Main program"""
    print("Starting maze demonstration...")
    print("The program will display a pygame window showing a ball moving through the maze")
    print("Press the spacebar to pause/resume, and the ESC key to exit")

    # We increase the width from 800 to 1000
    viz = SimpleMazeVisualization(width=1000, height=600)

    # Create environment
    env = DynamicMazeEnv(size=10, obstacle_ratio=0.25, change_frequency=20)
    env.max_steps = 100
   
    # Create agent
    agent = ReflectionAgent(env.action_space)
    agent.confidence_threshold = 0.25
    agent.adaptation_threshold = 0.45

    # --- ADD THIS LINE HERE: Map the actions to names ---
    action_names = ["Up", "Down", "Left", "Right"]

    # Set goal position
    agent.set_goal_position(env.goal_pos)
   
    try:
        episode = 0
        while episode < 5 and viz.running:  # Only run 5 episodes
            # 1. Reset the environment FIRST so the data exists
            state, _ = env.reset()
            
            viz.status_text = f"Ready for Episode {episode + 1}. Press ENTER."
            viz.waiting_for_input = True
            
            while viz.waiting_for_input and viz.running:
                viz.handle_events() # Listen for ENTER
                viz.draw_maze(env.maze, state, env.goal_pos) # Show "Ready" screen
            print(f"\nStarting episode {episode + 1}")   

            # Reset environment
            state, _ = env.reset()
            # --- ADD THIS LINE HERE: Clear history for the new episode ---
            viz.path_history = []
            steps = 0
            done = False

        
            while not done and steps < env.max_steps and viz.running:
                # Handle events
                if not viz.handle_events():
                    break

                if viz.paused:
                    pygame.time.wait(100)
                    continue

                # Select action
                action = agent.select_action(state)
               
                # Execute action
                next_state, reward, done, _, _ = env.step(action)

                # --- UPDATE ACTION TEXT HERE ---
                # Now that the step is finished, we update the display to show what it just did
                viz.last_action_text = action_names[action]

                # Learn
                agent.learn(state, action, reward, next_state, done, steps,
                          env.get_optimal_path_length())

                # Update state
                state = next_state
                # --- ADD THIS LINE HERE: Save the position for the gray dots ---
                viz.path_history.append(state)
                steps += 1

                # Update visualization
                viz.draw_maze(env.maze, state, env.goal_pos)

                # Control speed
                pygame.time.wait(200)  # 200ms delay, making movement easier to observe

                # Check if goal is reached
                if done and np.array_equal(state, env.goal_pos):
                    viz.status_text = "Status: Goal Achieved!" # Update the display
                    viz.goal_status = "Goal Achieved!"
                    print(f"Episode {episode + 1} completed successfully! Steps: {steps}")
                elif steps >= env.max_steps:
                    viz.status_text = "Status: Goal Not Achieved (Timeout)" # Update the display
                    viz.goal_status = "Goal Not Achieved"
                    print(f"Episode {episode + 1} timed out, Steps: {steps}")
       
                 # IMPORTANT: Draw the status one last time so the text stays on screen
                viz.steps_taken = steps # Update step count
                viz.draw_maze(env.maze, state, env.goal_pos)
            episode += 1
    
    except KeyboardInterrupt:
        print("\nProgram interrupted by user")
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("Program finished")
        viz.running = False
        pygame.quit()

if __name__ == "__main__":
    main() 
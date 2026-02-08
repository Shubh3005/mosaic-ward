def calculate_velocity(current_y, previous_y, time_delta):
    """Calculates vertical velocity in pixels/sec."""
    if time_delta == 0: return 0
    return (current_y - previous_y) / time_delta

def is_fall_detected(velocity, y_position, floor_threshold=0.8, velocity_threshold=2.5):
    """
    Pure function to determine if a fall occurred.
    - y_position: 0 (top) to 1 (bottom)
    - velocity: positive is moving down
    """
    is_on_floor = y_position > floor_threshold
    is_fast = velocity > velocity_threshold
    
    return is_on_floor and is_fast
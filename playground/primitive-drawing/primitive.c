#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <emscripten.h>

// Constants
#define MAX_SHAPES 1000
#define MAX_CANDIDATES 200
#define MAX_MUTATIONS 20

// Shape types
typedef enum {
    TRIANGLE = 0,
    RECTANGLE = 1,
    ELLIPSE = 2
} ShapeType;

// Structure definitions
typedef struct {
    unsigned char r, g, b, a;
} Color;

typedef struct {
    int left;
    int top;
    int width;
    int height;
} BoundingBox;

typedef struct {
    ShapeType type;
    BoundingBox bbox;
    union {
        struct { int x1, y1, x2, y2, x3, y3; } triangle;
        struct { int x1, y1, x2, y2; } rectangle;
        struct { int cx, cy, rx, ry; } ellipse;
    } data;
    Color color;
    float alpha;
} Shape;

typedef struct {
    int width;
    int height;
    unsigned char* data; // RGBA data
} Image;

typedef struct {
    Image* target;
    Image* current;
    Shape* shapes;
    int shape_count;
    Color background;
    float distance;
    // Shape type settings
    int use_triangles;
    int use_rectangles;
    int use_ellipses;
} State;

// Global buffer for mask operations to avoid repeated allocations
unsigned char* global_mask_buffer = NULL;
int global_mask_buffer_size = 0;

// Function prototypes
int random_int(int min, int max);
float random_float();
float clamp(float value, float min, float max);
int clamp_color(float value);
void init_random();

// Image operations
Image* create_image(int width, int height);
void free_image(Image* img);
void fill_image(Image* img, Color color);
Image* clone_image(Image* source);
float compute_distance(Image* img1, Image* img2);

// Shape operations
Shape create_random_shape(int width, int height, float alpha, State* state);
Shape mutate_shape(Shape shape, float alpha);
void render_shape(Image* img, Shape shape);
void render_shape_to_mask(int width, int height, Shape shape);
Color compute_optimal_color(Image* current, Image* target, Shape shape);
float compute_difference_change_direct(Image* current, Image* target, Shape shape, Color color);

// State operations
State* init_state(Image* target, Color background, int use_triangles, int use_rectangles, int use_ellipses);
void free_state(State* state);
void add_shape_to_state(State* state, Shape shape);
void export_svg(State* state, const char* filename);

// Optimizer
Shape find_best_shape(State* state, int candidates);
Shape optimize_shape(State* state, Shape shape, int mutations);
void run_optimizer(State* state, int steps, int candidates, int mutations);

// WebAssembly exports
EMSCRIPTEN_KEEPALIVE
void* create_optimizer(int width, int height, unsigned char* target_data, int bg_r, int bg_g, int bg_b, int use_triangles, int use_rectangles, int use_ellipses);

EMSCRIPTEN_KEEPALIVE
void run_optimization(void* state_ptr, int steps, int candidates, int mutations);

EMSCRIPTEN_KEEPALIVE
unsigned char* get_current_image(void* state_ptr);

EMSCRIPTEN_KEEPALIVE
float get_current_similarity(void* state_ptr);

EMSCRIPTEN_KEEPALIVE
char* export_svg_string(void* state_ptr);

EMSCRIPTEN_KEEPALIVE
void free_optimizer(void* state_ptr);

// Implementation of core functionality
int random_int(int min, int max) {
    return min + rand() % (max - min + 1);
}

float random_float() {
    return (float)rand() / RAND_MAX;
}

float clamp(float value, float min, float max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

int clamp_color(float value) {
    return (int)clamp(value, 0, 255);
}

void init_random() {
    srand(time(NULL));
}

// Initialize or resize the global mask buffer
void ensure_mask_buffer(int width, int height) {
    int required_size = width * height * 4;
    if (global_mask_buffer == NULL || global_mask_buffer_size < required_size) {
        if (global_mask_buffer) {
            free(global_mask_buffer);
        }
        global_mask_buffer = (unsigned char*)calloc(required_size, sizeof(unsigned char));
        global_mask_buffer_size = required_size;
    }
}

// Clear the mask buffer within a specific bounding box - FIXED
void clear_mask_region(int width, int height, BoundingBox bbox) {
    int left = fmax(0, bbox.left);
    int top = fmax(0, bbox.top);
    int right = fmin(width - 1, bbox.left + bbox.width - 1);
    int bottom = fmin(height - 1, bbox.top + bbox.height - 1);
    
    if (left > right || top > bottom) return;
    
    for (int y = top; y <= bottom; y++) {
        // Start at the correct left position, not at the beginning of the row
        memset(&global_mask_buffer[(y * width + left) * 4], 0, (right - left + 1) * 4);
    }
}

Image* create_image(int width, int height) {
    Image* img = (Image*)malloc(sizeof(Image));
    img->width = width;
    img->height = height;
    img->data = (unsigned char*)calloc(width * height * 4, sizeof(unsigned char));
    return img;
}

void free_image(Image* img) {
    if (img) {
        free(img->data);
        free(img);
    }
}

void fill_image(Image* img, Color color) {
    for (int i = 0; i < img->width * img->height; i++) {
        img->data[i * 4] = color.r;
        img->data[i * 4 + 1] = color.g;
        img->data[i * 4 + 2] = color.b;
        img->data[i * 4 + 3] = 255; // Full alpha
    }
}

Image* clone_image(Image* source) {
    Image* clone = create_image(source->width, source->height);
    memcpy(clone->data, source->data, source->width * source->height * 4 * sizeof(unsigned char));
    return clone;
}

// Updated distance function to exactly match JS implementation (skip alpha channel)
float compute_distance(Image* img1, Image* img2) {
    float sum = 0;
    int pixels = img1->width * img1->height;
    int total_channels = pixels * 4;
    
    for (int i = 0; i < total_channels; i++) {
        // Skip alpha channel (every 4th byte)
        if (i % 4 == 3) continue;
        
        float diff = (float)(img1->data[i] - img2->data[i]);
        sum += diff * diff;
    }
    
    // Match JS normalization
    return sqrt(sum / (3.0f * 255.0f * 255.0f * pixels));
}

// Helper function to determine available shape types based on user selection
ShapeType select_random_shape_type(State* state) {
    // Count how many types are enabled
    int enabled_types = state->use_triangles + state->use_rectangles + state->use_ellipses;
    
    // If none are enabled, default to all shapes
    if (enabled_types == 0) {
        state->use_triangles = 1;
        state->use_rectangles = 1;
        state->use_ellipses = 1;
        enabled_types = 3;
    }
    
    // Select a random index based on enabled types
    int index = random_int(0, enabled_types - 1);
    
    // Find the shape type at that index
    int current = 0;
    
    if (state->use_triangles) {
        if (current == index) return TRIANGLE;
        current++;
    }
    
    if (state->use_rectangles) {
        if (current == index) return RECTANGLE;
        current++;
    }
    
    if (state->use_ellipses) {
        if (current == index) return ELLIPSE;
    }
    
    // Default to triangle (should never get here)
    return TRIANGLE;
}

Shape create_random_shape(int width, int height, float alpha, State* state) {
    Shape shape;
    shape.alpha = alpha;
    
    // Select a random shape type from enabled types
    shape.type = select_random_shape_type(state);
    
    // Default color (will be optimized later)
    shape.color.r = 0;
    shape.color.g = 0;
    shape.color.b = 0;
    shape.color.a = 255;
    
    switch(shape.type) {
        case TRIANGLE:
            shape.data.triangle.x1 = random_int(0, width - 1);
            shape.data.triangle.y1 = random_int(0, height - 1);
            shape.data.triangle.x2 = random_int(0, width - 1);
            shape.data.triangle.y2 = random_int(0, height - 1);
            shape.data.triangle.x3 = random_int(0, width - 1);
            shape.data.triangle.y3 = random_int(0, height - 1);
            
            // Compute bounding box
            int min_x = fmin(shape.data.triangle.x1, fmin(shape.data.triangle.x2, shape.data.triangle.x3));
            int min_y = fmin(shape.data.triangle.y1, fmin(shape.data.triangle.y2, shape.data.triangle.y3));
            int max_x = fmax(shape.data.triangle.x1, fmax(shape.data.triangle.x2, shape.data.triangle.x3));
            int max_y = fmax(shape.data.triangle.y1, fmax(shape.data.triangle.y2, shape.data.triangle.y3));
            
            shape.bbox.left = min_x;
            shape.bbox.top = min_y;
            shape.bbox.width = max_x - min_x + 1;
            shape.bbox.height = max_y - min_y + 1;
            break;
            
        case RECTANGLE:
            {
                int x1 = random_int(0, width - 1);
                int y1 = random_int(0, height - 1);
                int x2 = random_int(0, width - 1);
                int y2 = random_int(0, height - 1);
                
                shape.data.rectangle.x1 = fmin(x1, x2);
                shape.data.rectangle.y1 = fmin(y1, y2);
                shape.data.rectangle.x2 = fmax(x1, x2);
                shape.data.rectangle.y2 = fmax(y1, y2);
                
                shape.bbox.left = shape.data.rectangle.x1;
                shape.bbox.top = shape.data.rectangle.y1;
                shape.bbox.width = shape.data.rectangle.x2 - shape.data.rectangle.x1 + 1;
                shape.bbox.height = shape.data.rectangle.y2 - shape.data.rectangle.y1 + 1;
            }
            break;
            
        case ELLIPSE:
            shape.data.ellipse.cx = random_int(0, width - 1);
            shape.data.ellipse.cy = random_int(0, height - 1);
            shape.data.ellipse.rx = random_int(1, width / 4);
            shape.data.ellipse.ry = random_int(1, height / 4);
            
            shape.bbox.left = shape.data.ellipse.cx - shape.data.ellipse.rx;
            shape.bbox.top = shape.data.ellipse.cy - shape.data.ellipse.ry;
            shape.bbox.width = 2 * shape.data.ellipse.rx;
            shape.bbox.height = 2 * shape.data.ellipse.ry;
            break;
    }
    
    return shape;
}

// Optimized point-in-triangle test
int point_in_triangle(int x, int y, int x1, int y1, int x2, int y2, int x3, int y3) {
    // Barycentric coordinate method - optimized version
    int area = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
    if (area == 0) return 0; // Degenerate triangle
    
    float s = (float)((y1 - y3) * (x - x3) + (x3 - x1) * (y - y3)) / area;
    if (s < 0 || s > 1) return 0;
    
    float t = (float)((y3 - y2) * (x - x3) + (x2 - x3) * (y - y3)) / -area;
    
    return (t >= 0 && s + t <= 1);
}

// Helper function to check if a point is inside an ellipse
int point_in_ellipse(int x, int y, int cx, int cy, int rx, int ry) {
    if (rx <= 0 || ry <= 0) return 0;
    
    float dx = (float)(x - cx) / rx;
    float dy = (float)(y - cy) / ry;
    return (dx * dx + dy * dy) <= 1.0f;
}

void render_shape(Image* img, Shape shape) {
    int x, y;
    int left = fmax(0, shape.bbox.left);
    int top = fmax(0, shape.bbox.top);
    int right = fmin(img->width - 1, shape.bbox.left + shape.bbox.width - 1);
    int bottom = fmin(img->height - 1, shape.bbox.top + shape.bbox.height - 1);
    
    if (left > right || top > bottom) return;
    
    // Optimize for rectangle case - can use memset for rectangular regions
    if (shape.type == RECTANGLE) {
        for (y = top; y <= bottom; y++) {
            int idx = (y * img->width + left) * 4;
            for (x = left; x <= right; x++) {
                float src_r = shape.color.r;
                float src_g = shape.color.g;
                float src_b = shape.color.b;
                float src_a = shape.alpha;
                float dst_a = 1.0f - src_a;
                
                img->data[idx] = clamp_color(src_r * src_a + img->data[idx] * dst_a);
                img->data[idx + 1] = clamp_color(src_g * src_a + img->data[idx + 1] * dst_a);
                img->data[idx + 2] = clamp_color(src_b * src_a + img->data[idx + 2] * dst_a);
                idx += 4;
            }
        }
        return;
    }
    
    // For triangle and ellipse, test each pixel
    for (y = top; y <= bottom; y++) {
        for (x = left; x <= right; x++) {
            int inside = 0;
            
            switch(shape.type) {
                case TRIANGLE:
                    inside = point_in_triangle(
                        x, y,
                        shape.data.triangle.x1, shape.data.triangle.y1,
                        shape.data.triangle.x2, shape.data.triangle.y2,
                        shape.data.triangle.x3, shape.data.triangle.y3
                    );
                    break;
                    
                case ELLIPSE:
                    inside = point_in_ellipse(
                        x, y,
                        shape.data.ellipse.cx, shape.data.ellipse.cy,
                        shape.data.ellipse.rx, shape.data.ellipse.ry
                    );
                    break;
                    
                case RECTANGLE:
                    // This is already handled more efficiently above
                    break;
            }
            
            if (inside) {
                int idx = (y * img->width + x) * 4;
                float src_r = shape.color.r;
                float src_g = shape.color.g;
                float src_b = shape.color.b;
                float src_a = shape.alpha;
                float dst_a = 1.0f - src_a;
                
                img->data[idx] = clamp_color(src_r * src_a + img->data[idx] * dst_a);
                img->data[idx + 1] = clamp_color(src_g * src_a + img->data[idx + 1] * dst_a);
                img->data[idx + 2] = clamp_color(src_b * src_a + img->data[idx + 2] * dst_a);
            }
        }
    }
}

// Render a shape to the global mask buffer - only need alpha channel
void render_shape_to_mask(int width, int height, Shape shape) {
    int x, y;
    int left = fmax(0, shape.bbox.left);
    int top = fmax(0, shape.bbox.top);
    int right = fmin(width - 1, shape.bbox.left + shape.bbox.width - 1);
    int bottom = fmin(height - 1, shape.bbox.top + shape.bbox.height - 1);
    
    if (left > right || top > bottom) return;
    
    // Clear the mask region first
    clear_mask_region(width, height, shape.bbox);
    
    // Fast path for rectangles
    if (shape.type == RECTANGLE) {
        for (y = top; y <= bottom; y++) {
            for (x = left; x <= right; x++) {
                int idx = (y * width + x) * 4;
                global_mask_buffer[idx + 3] = 255; // Full alpha
            }
        }
        return;
    }
    
    // For other shapes, check each pixel
    for (y = top; y <= bottom; y++) {
        for (x = left; x <= right; x++) {
            int inside = 0;
            
            switch(shape.type) {
                case TRIANGLE:
                    inside = point_in_triangle(
                        x, y,
                        shape.data.triangle.x1, shape.data.triangle.y1,
                        shape.data.triangle.x2, shape.data.triangle.y2,
                        shape.data.triangle.x3, shape.data.triangle.y3
                    );
                    break;
                    
                case ELLIPSE:
                    inside = point_in_ellipse(
                        x, y,
                        shape.data.ellipse.cx, shape.data.ellipse.cy,
                        shape.data.ellipse.rx, shape.data.ellipse.ry
                    );
                    break;
                    
                case RECTANGLE:
                    // Already handled above
                    break;
            }
            
            if (inside) {
                int idx = (y * width + x) * 4;
                global_mask_buffer[idx + 3] = 255; // Set alpha to indicate "inside"
            }
        }
    }
}

Shape mutate_shape(Shape shape, float alpha) {
    Shape mutated = shape;
    int amount;
    float angle, radius;
    
    switch(shape.type) {
        case TRIANGLE:
            {
                // Choose a random vertex to mutate
                int vertex = random_int(0, 2);
                angle = random_float() * 2 * M_PI;
                radius = random_float() * 20;
                
                if (vertex == 0) {
                    mutated.data.triangle.x1 += (int)(radius * cos(angle));
                    mutated.data.triangle.y1 += (int)(radius * sin(angle));
                } else if (vertex == 1) {
                    mutated.data.triangle.x2 += (int)(radius * cos(angle));
                    mutated.data.triangle.y2 += (int)(radius * sin(angle));
                } else {
                    mutated.data.triangle.x3 += (int)(radius * cos(angle));
                    mutated.data.triangle.y3 += (int)(radius * sin(angle));
                }
                
                // Recompute bounding box
                int min_x = fmin(mutated.data.triangle.x1, fmin(mutated.data.triangle.x2, mutated.data.triangle.x3));
                int min_y = fmin(mutated.data.triangle.y1, fmin(mutated.data.triangle.y2, mutated.data.triangle.y3));
                int max_x = fmax(mutated.data.triangle.x1, fmax(mutated.data.triangle.x2, mutated.data.triangle.x3));
                int max_y = fmax(mutated.data.triangle.y1, fmax(mutated.data.triangle.y2, mutated.data.triangle.y3));
                
                mutated.bbox.left = min_x;
                mutated.bbox.top = min_y;
                mutated.bbox.width = max_x - min_x + 1;
                mutated.bbox.height = max_y - min_y + 1;
            }
            break;
            
        case RECTANGLE:
            {
                // Choose a side to mutate
                int side = random_int(0, 3);
                amount = (int)((random_float() - 0.5) * 20);
                
                if (side == 0) { // Left side
                    mutated.data.rectangle.x1 += amount;
                } else if (side == 1) { // Top side
                    mutated.data.rectangle.y1 += amount;
                } else if (side == 2) { // Right side
                    mutated.data.rectangle.x2 += amount;
                } else { // Bottom side
                    mutated.data.rectangle.y2 += amount;
                }
                
                // Ensure x1 <= x2 and y1 <= y2
                if (mutated.data.rectangle.x1 > mutated.data.rectangle.x2) {
                    int temp = mutated.data.rectangle.x1;
                    mutated.data.rectangle.x1 = mutated.data.rectangle.x2;
                    mutated.data.rectangle.x2 = temp;
                }
                
                if (mutated.data.rectangle.y1 > mutated.data.rectangle.y2) {
                    int temp = mutated.data.rectangle.y1;
                    mutated.data.rectangle.y1 = mutated.data.rectangle.y2;
                    mutated.data.rectangle.y2 = temp;
                }
                
                // Recompute bounding box
                mutated.bbox.left = mutated.data.rectangle.x1;
                mutated.bbox.top = mutated.data.rectangle.y1;
                mutated.bbox.width = mutated.data.rectangle.x2 - mutated.data.rectangle.x1 + 1;
                mutated.bbox.height = mutated.data.rectangle.y2 - mutated.data.rectangle.y1 + 1;
            }
            break;
            
        case ELLIPSE:
            {
                // Choose what to mutate
                int mutation_type = random_int(0, 2);
                
                if (mutation_type == 0) { // Move center
                    angle = random_float() * 2 * M_PI;
                    radius = random_float() * 20;
                    mutated.data.ellipse.cx += (int)(radius * cos(angle));
                    mutated.data.ellipse.cy += (int)(radius * sin(angle));
                } else if (mutation_type == 1) { // Change rx
                    amount = (int)((random_float() - 0.5) * 20);
                    mutated.data.ellipse.rx += amount;
                    mutated.data.ellipse.rx = fmax(1, mutated.data.ellipse.rx);
                } else { // Change ry
                    amount = (int)((random_float() - 0.5) * 20);
                    mutated.data.ellipse.ry += amount;
                    mutated.data.ellipse.ry = fmax(1, mutated.data.ellipse.ry);
                }
                
                // Recompute bounding box
                mutated.bbox.left = mutated.data.ellipse.cx - mutated.data.ellipse.rx;
                mutated.bbox.top = mutated.data.ellipse.cy - mutated.data.ellipse.ry;
                mutated.bbox.width = 2 * mutated.data.ellipse.rx;
                mutated.bbox.height = 2 * mutated.data.ellipse.ry;
            }
            break;
    }
    
    // Sometimes mutate alpha
    if (random_float() < 0.2) {
        mutated.alpha = alpha + (random_float() - 0.5) * 0.08f;
        mutated.alpha = clamp(mutated.alpha, 0.1f, 1.0f);
    }
    
    return mutated;
}

// Rewritten to match the JS computeColor function more closely
Color compute_optimal_color(Image* current, Image* target, Shape shape) {
    // Initialize global mask buffer if needed
    ensure_mask_buffer(current->width, current->height);
    
    // Render shape to mask
    render_shape_to_mask(current->width, current->height, shape);
    
    // Match JS computeColor implementation
    float r_sum = 0, g_sum = 0, b_sum = 0;
    int count = 0;
    
    int left = fmax(0, shape.bbox.left);
    int top = fmax(0, shape.bbox.top);
    int right = fmin(current->width - 1, shape.bbox.left + shape.bbox.width - 1);
    int bottom = fmin(current->height - 1, shape.bbox.top + shape.bbox.height - 1);
    
    if (left > right || top > bottom) {
        return (Color){0, 0, 0, 255};
    }
    
    for (int y = top; y <= bottom; y++) {
        for (int x = left; x <= right; x++) {
            int idx = (y * current->width + x) * 4;
            
            // Only where mask indicates shape presence
            if (global_mask_buffer[idx + 3] > 0) {
                // Exact JS formula: color += (target - current) / alpha + current
                r_sum += (target->data[idx] - current->data[idx]) / shape.alpha + current->data[idx];
                g_sum += (target->data[idx + 1] - current->data[idx + 1]) / shape.alpha + current->data[idx + 1];
                b_sum += (target->data[idx + 2] - current->data[idx + 2]) / shape.alpha + current->data[idx + 2];
                count++;
            }
        }
    }
    
    Color color = {0, 0, 0, 255};
    
    if (count > 0) {
        color.r = clamp_color(r_sum / count);
        color.g = clamp_color(g_sum / count);
        color.b = clamp_color(b_sum / count);
    }
    
    return color;
}

// Direct difference calculation without creating temporary images - FIXED
float compute_difference_change_direct(Image* current, Image* target, Shape shape, Color color) {
    // Initialize global mask buffer if needed
    ensure_mask_buffer(current->width, current->height);
    
    // Render shape to mask
    render_shape_to_mask(current->width, current->height, shape);
    
    // Compute difference change directly
    float sum = 0;
    
    int left = fmax(0, shape.bbox.left);
    int top = fmax(0, shape.bbox.top);
    int right = fmin(current->width - 1, shape.bbox.left + shape.bbox.width - 1);
    int bottom = fmin(current->height - 1, shape.bbox.top + shape.bbox.height - 1);
    
    if (left > right || top > bottom) {
        return 0;
    }
    
    for (int y = top; y <= bottom; y++) {
        for (int x = left; x <= right; x++) {
            int idx = (y * current->width + x) * 4;
            
            // Only where mask indicates shape presence
            if (global_mask_buffer[idx + 3] > 0) {
                float a = shape.alpha;
                float b = 1.0f - a;
                
                // Current difference (before applying shape)
                float d1r = target->data[idx] - current->data[idx];
                float d1g = target->data[idx + 1] - current->data[idx + 1];
                float d1b = target->data[idx + 2] - current->data[idx + 2];
                
                // New difference (after applying shape)
                float d2r = target->data[idx] - (color.r * a + current->data[idx] * b);
                float d2g = target->data[idx + 1] - (color.g * a + current->data[idx + 1] * b);
                float d2b = target->data[idx + 2] - (color.b * a + current->data[idx + 2] * b);
                
                // Subtract old squared error, add new squared error
                sum += (d2r * d2r + d2g * d2g + d2b * d2b) - (d1r * d1r + d1g * d1g + d1b * d1b);
            }
        }
    }
    
    // Simply return the sum of squared error changes
    // Negative values indicate improvement (less error)
    return sum;
}

State* init_state(Image* target, Color background, int use_triangles, int use_rectangles, int use_ellipses) {
    State* state = (State*)malloc(sizeof(State));
    state->target = target;
    state->current = create_image(target->width, target->height);
    fill_image(state->current, background);
    state->background = background;
    state->shapes = (Shape*)malloc(MAX_SHAPES * sizeof(Shape));
    state->shape_count = 0;
    state->distance = compute_distance(state->current, target);
    
    // Store shape type settings
    state->use_triangles = use_triangles;
    state->use_rectangles = use_rectangles;
    state->use_ellipses = use_ellipses;
    
    // Initialize the global mask buffer
    ensure_mask_buffer(target->width, target->height);
    
    return state;
}

void free_state(State* state) {
    if (state) {
        free_image(state->current);
        free(state->shapes);
        free(state);
    }
}

void add_shape_to_state(State* state, Shape shape) {
    if (state->shape_count < MAX_SHAPES) {
        state->shapes[state->shape_count++] = shape;
        render_shape(state->current, shape);
        state->distance = compute_distance(state->current, state->target);
    }
}

void export_svg(State* state, const char* filename) {
    FILE* file = fopen(filename, "w");
    if (!file) return;
    
    int width = state->current->width;
    int height = state->current->height;
    
    // SVG header
    fprintf(file, "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%d\" height=\"%d\" viewBox=\"0 0 %d %d\">\n", 
            width, height, width, height);
    
    // Background
    fprintf(file, "  <rect width=\"100%%\" height=\"100%%\" fill=\"rgb(%d,%d,%d)\" />\n", 
            state->background.r, state->background.g, state->background.b);
    
    // Shapes
    for (int i = 0; i < state->shape_count; i++) {
        Shape shape = state->shapes[i];
        Color color = shape.color;
        
        fprintf(file, "  ");
        
        switch(shape.type) {
            case TRIANGLE:
                fprintf(file, "<polygon points=\"%d,%d %d,%d %d,%d\" ", 
                        shape.data.triangle.x1, shape.data.triangle.y1,
                        shape.data.triangle.x2, shape.data.triangle.y2,
                        shape.data.triangle.x3, shape.data.triangle.y3);
                break;
                
            case RECTANGLE:
                fprintf(file, "<polygon points=\"%d,%d %d,%d %d,%d %d,%d\" ", 
                        shape.data.rectangle.x1, shape.data.rectangle.y1,
                        shape.data.rectangle.x2, shape.data.rectangle.y1,
                        shape.data.rectangle.x2, shape.data.rectangle.y2,
                        shape.data.rectangle.x1, shape.data.rectangle.y2);
                break;
                
            case ELLIPSE:
                fprintf(file, "<ellipse cx=\"%d\" cy=\"%d\" rx=\"%d\" ry=\"%d\" ", 
                        shape.data.ellipse.cx, shape.data.ellipse.cy,
                        shape.data.ellipse.rx, shape.data.ellipse.ry);
                break;
        }
        
        fprintf(file, "fill=\"rgb(%d,%d,%d)\" fill-opacity=\"%.2f\" />\n", 
                color.r, color.g, color.b, shape.alpha);
    }
    
    // SVG footer
    fprintf(file, "</svg>\n");
    
    fclose(file);
}

Shape find_best_shape(State* state, int candidates) {
    Shape best_shape;
    float best_difference = INFINITY;
    
    for (int i = 0; i < candidates; i++) {
        Shape shape = create_random_shape(state->current->width, state->current->height, 0.5f, state);
        Color color = compute_optimal_color(state->current, state->target, shape);
        shape.color = color;
        
        float diff_change = compute_difference_change_direct(state->current, state->target, shape, color);
        
        if (diff_change < best_difference) {
            best_difference = diff_change;
            best_shape = shape;
        }
    }
    
    return best_shape;
}

// OPTIMIZATION: Improved mutation strategy to match JavaScript implementation
// Reset failure counter on success to allow more productive exploration
Shape optimize_shape(State* state, Shape shape, int mutations) {
    Shape best_shape = shape;
    float best_difference = compute_difference_change_direct(state->current, state->target, shape, shape.color);
    int failed_attempts = 0;
    int total_attempts = 0;
    
    // Continue until we hit the maximum number of consecutive failures
    while (failed_attempts < mutations) {
        total_attempts++;
        
        Shape mutated = mutate_shape(best_shape, best_shape.alpha);
        Color color = compute_optimal_color(state->current, state->target, mutated);
        mutated.color = color;
        
        float diff_change = compute_difference_change_direct(state->current, state->target, mutated, color);
        
        if (diff_change < best_difference) {
            // Found an improvement - reset the failure counter
            best_difference = diff_change;
            best_shape = mutated;
            failed_attempts = 0;  // Reset on success
        } else {
            // No improvement - count as a failure
            failed_attempts++;
        }
    }
    
    return best_shape;
}

void run_optimizer(State* state, int steps, int candidates, int mutations) {
    init_random();
    
    for (int step = 0; step < steps; step++) {
        // Find the best shape among candidates
        Shape best_shape = find_best_shape(state, candidates);
        
        // Optimize the shape through mutations
        Shape optimized = optimize_shape(state, best_shape, mutations);
        
        // Add the shape to the current state
        add_shape_to_state(state, optimized);
        
        // Report progress
        float similarity = (1.0f - state->distance) * 100.0f;
        printf("Step %d: distance = %.6f, similarity = %.2f%%\n", step + 1, state->distance, similarity);
    }
}

// WebAssembly exports implementation
EMSCRIPTEN_KEEPALIVE
void* create_optimizer(int width, int height, unsigned char* target_data, int bg_r, int bg_g, int bg_b, int use_triangles, int use_rectangles, int use_ellipses) {
    init_random();
    
    // Create target image
    Image* target = create_image(width, height);
    memcpy(target->data, target_data, width * height * 4 * sizeof(unsigned char));
    
    // Create state with the provided background color and shape settings
    Color background = {bg_r, bg_g, bg_b, 255};
    State* state = init_state(target, background, use_triangles, use_rectangles, use_ellipses);
    
    return state;
}

EMSCRIPTEN_KEEPALIVE
void run_optimization(void* state_ptr, int steps, int candidates, int mutations) {
    State* state = (State*)state_ptr;
    run_optimizer(state, steps, candidates, mutations);
}

EMSCRIPTEN_KEEPALIVE
unsigned char* get_current_image(void* state_ptr) {
    State* state = (State*)state_ptr;
    return state->current->data;
}

EMSCRIPTEN_KEEPALIVE
float get_current_similarity(void* state_ptr) {
    State* state = (State*)state_ptr;
    return (1.0f - state->distance) * 100.0f;
}

EMSCRIPTEN_KEEPALIVE
char* export_svg_string(void* state_ptr) {
    State* state = (State*)state_ptr;
    
    // Export to a temporary file
    export_svg(state, "temp.svg");
    
    // Read the file back into memory
    FILE* file = fopen("temp.svg", "r");
    if (!file) return NULL;
    
    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    fseek(file, 0, SEEK_SET);
    
    char* svg_string = (char*)malloc(size + 1);
    fread(svg_string, 1, size, file);
    svg_string[size] = '\0';
    
    fclose(file);
    return svg_string;
}

EMSCRIPTEN_KEEPALIVE
void free_optimizer(void* state_ptr) {
    State* state = (State*)state_ptr;
    free_image(state->target);
    free_state(state);
    
    // Free global mask buffer when optimizer is freed
    if (global_mask_buffer) {
        free(global_mask_buffer);
        global_mask_buffer = NULL;
        global_mask_buffer_size = 0;
    }
}